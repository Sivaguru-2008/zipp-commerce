const ApiError = require('../utils/ApiError');
const analytics = require('../utils/analytics');
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

  // Stock revalidation before we mutate anything.
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

  const order = await repo.create({
    user: userId,
    items,
    deliveryAddress,
    pricing: { subtotal, deliveryFee, tax, discount: 0, couponDiscount, total },
    payment: { method: paymentMethod, status: 'pending' },
    coupon: cart.coupon,
    deliveryInstructions,
    estimatedDelivery: new Date(Date.now() + ESTIMATED_DELIVERY_MS),
    statusHistory: [{ status: 'placed', message: 'Order placed successfully', timestamp: new Date() }]
  });

  // Atomic stock decrement with $gte guard — rolls back the order if any
  // product was sold out between revalidation and now.
  const stockErrors = [];
  for (const item of cart.items) {
    const updated = await repo.decrementStockIfAvailable(item.product._id, item.quantity);
    if (!updated) stockErrors.push(item.product.name || item.name);
  }
  if (stockErrors.length > 0) {
    await repo.deleteById(order._id);
    throw new ApiError(409, `Stock depleted for: ${stockErrors.join(', ')}. Please refresh your cart.`);
  }

  await repo.clearCart(userId);
  // Stock changed for every line item — drop cached product views so the
  // next read reflects current stock. Fire-and-forget; cache miss is safe.
  productService.invalidate().catch(() => {});
  analytics.incrementOrder(userId, items).catch(() => {});
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
