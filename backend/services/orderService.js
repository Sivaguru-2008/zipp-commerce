const ApiError = require('../utils/ApiError');
const analytics = require('../utils/analytics');
const sentry = require('../utils/sentry');
const { withTransaction } = require('../utils/tx');
const productService = require('./productService');
const paymentService = require('./paymentService');
const repo = require('../repositories/orderRepository');

const FREE_DELIVERY_THRESHOLD = 499;
const DELIVERY_FEE = 40;
const TAX_RATE = 0.05;
const ESTIMATED_DELIVERY_MS = 30 * 60 * 1000;

exports.listForUser = async (userId, { page = 1, limit = 20 }) => {
  const p = +page || 1;
  const l = +limit || 20;
  const [total, orders] = await Promise.all([
    repo.countByUser(userId),
    repo.findByUser(userId, { limit: l, skip: (p - 1) * l })
  ]);
  return { orders, total, page: p, pages: Math.ceil(total / l) };
};

exports.getById = async (orderId, requester) => {
  const order = await repo.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  const isOwner = order.user.toString() === requester._id.toString();
  if (!isOwner && requester.role !== 'admin') {
    throw new ApiError(403, 'Unauthorized');
  }
  return order;
};

exports.placeOrder = async (userId, { deliveryAddress, paymentMethod = 'cod', deliveryInstructions, coupon: clientCoupon }) => {
  if (!deliveryAddress) throw new ApiError(400, 'Delivery address is required');

  // Read cart outside the transaction — populate() with sessions can be
  // problematic across Mongoose versions, and we re-validate stock inside
  // the tx via the atomic $gte decrement anyway.
  const cart = await repo.findCartWithProducts(userId);
  if (!cart || cart.items.length === 0) {
    throw new ApiError(400, 'Cart is empty');
  }

  // Backward compat: if the client sends a coupon in the request body and
  // the cart doesn't have one yet, accept it. Server-side cart.coupon is
  // still the source of truth — the live coupon validator runs in the
  // cartController.applyCoupon endpoint for the canonical path.
  if (!cart.coupon && clientCoupon && clientCoupon.code && clientCoupon.discount > 0) {
    cart.coupon = {
      code: String(clientCoupon.code).toUpperCase(),
      discount: Math.max(0, Math.floor(+clientCoupon.discount)),
      type: clientCoupon.type
    };
  }

  // Stock revalidation before we mutate anything (cheap fast-fail).
  for (const item of cart.items) {
    const product = item.product;
    if (!product || !product.isActive) {
      throw new ApiError(400, `Product "${item.name}" is no longer available`);
    }
    if (product.stock < item.quantity) {
      throw new ApiError(400, `Only ${product.stock} unit(s) left for "${product.name}"`);
    }
  }

  const items = cart.items.map(item => ({
    product: item.product._id,
    name: item.product.name,
    image: item.product.images[0] || '',
    price: item.price || item.product.price,
    quantity: item.quantity,
    subtotal: (item.price || item.product.price) * item.quantity
  }));

  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
  const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
  const tax = Math.round(subtotal * TAX_RATE);
  const couponDiscount = cart.coupon ? cart.coupon.discount : 0;
  const total = subtotal + deliveryFee + tax - couponDiscount;

  sentry.addBreadcrumb({
    category: 'order',
    message: 'place_order:start',
    data: { userId: String(userId), subtotal, total, itemCount: items.length, paymentMethod }
  });

  // === Atomic block ===
  // 1) Create the Order doc
  // 2) Decrement stock for every line item (atomic, with $gte guard)
  // 3) Clear the cart
  // If any line's stock goes below request qty, throw → tx aborts → order
  // and any prior decrements roll back.
  //
  // On standalone Mongo (dev) withTransaction passes session=null and the
  // existing best-effort rollback path applies (delete the order on
  // stock failure).
  const order = await withTransaction(async (session) => {
    const orderDoc = await repo.createInSession({
      user: userId,
      items,
      deliveryAddress,
      pricing: { subtotal, deliveryFee, tax, discount: 0, couponDiscount, total },
      payment: { method: paymentMethod, status: 'pending' },
      coupon: cart.coupon,
      deliveryInstructions,
      estimatedDelivery: new Date(Date.now() + ESTIMATED_DELIVERY_MS),
      statusHistory: [{ status: 'placed', message: 'Order placed successfully', timestamp: new Date() }]
    }, session);

    const stockErrors = [];
    const decrementedItems = [];
    for (const item of cart.items) {
      const updated = await repo.decrementStockIfAvailable(item.product._id, item.quantity, session);
      if (!updated) {
        stockErrors.push(item.product.name || item.name);
      } else {
        decrementedItems.push({ productId: item.product._id, quantity: item.quantity });
      }
    }

    if (stockErrors.length > 0) {
      if (session) {
        // Inside a real transaction — throwing rolls everything back including
        // the order doc and any successful decrements.
        throw new ApiError(409, `Stock depleted for: ${stockErrors.join(', ')}. Please refresh your cart.`);
      }
      // Standalone fallback: restore previously decremented items and remove the order doc
      for (const dec of decrementedItems) {
        await repo.restoreStock(dec.productId, dec.quantity, null).catch(() => {});
      }
      await repo.deleteById(orderDoc._id);
      throw new ApiError(409, `Stock depleted for: ${stockErrors.join(', ')}. Please refresh your cart.`);
    }

    await repo.clearCart(userId, session);
    return orderDoc;
  });

  // Stock changed for every line item — drop cached product views so the
  // next read reflects current stock. Fire-and-forget; cache miss is safe.
  productService.invalidate().catch(() => {});
  analytics.incrementOrder(userId, items).catch(() => {});
  sentry.addBreadcrumb({
    category: 'order',
    message: 'place_order:committed',
    data: { orderId: String(order._id), total }
  });
  return order;
};

exports.cancel = async (orderId, userId, reason) => {
  const order = await repo.findRawById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.user.toString() !== userId.toString()) {
    throw new ApiError(403, 'Unauthorized');
  }
  if (['delivered', 'cancelled'].includes(order.status)) {
    throw new ApiError(400, 'Cannot cancel this order');
  }

  order.status = 'cancelled';
  order.cancelledAt = new Date();
  order.cancellationReason = reason || 'Cancelled by customer';
  order.statusHistory.push({ status: 'cancelled', message: 'Order cancelled', timestamp: new Date() });
  await order.save();

  // Restore stock so the inventory reflects the cancellation.
  await Promise.all(order.items.map(item =>
    repo.restoreStock(item.product, item.quantity)
  ));
  productService.invalidate().catch(() => {});

  // Trigger refund if the order was paid via Razorpay. The refund call is
  // best-effort and does not block cancellation — the user gets a cancelled
  // order; finance can chase any failed refund via the order log.
  if (order.payment.status === 'paid' && order.payment.method === 'razorpay') {
    await paymentService.refund(order).catch(() => {});
  }
  return order;
};

exports.updateStatus = async (orderId, { status, message }) => {
  const order = await repo.findRawById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  order.status = status;
  order.statusHistory.push({ status, message: message || `Order ${status}`, timestamp: new Date() });
  if (status === 'delivered') {
    order.deliveredAt = new Date();
    order.payment.status = 'paid';
  }
  await order.save();
  return order;
};

exports.listAll = async ({ page = 1, limit = 20, status }) => {
  const p = +page || 1;
  const l = +limit || 20;
  const filter = status ? { status } : {};
  const [total, orders] = await Promise.all([
    repo.countAll(filter),
    repo.findAll(filter, { limit: l, skip: (p - 1) * l })
  ]);
  return { orders, total };
};
