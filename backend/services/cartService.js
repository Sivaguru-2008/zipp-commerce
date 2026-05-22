const ApiError = require('../utils/ApiError');
const cartRepo = require('../repositories/cartRepository');
const { Cart } = require('../models');
const Product = require('../models/Product');
const analytics = require('../utils/analytics');

const subtotalOf  = (items) => items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
const itemCountOf = (items) => items.reduce((sum, i) => sum + i.quantity, 0);

exports.get = async (userId) => {
  const cart = await cartRepo.findOrCreate(userId);
  // Filter out items whose product was deleted or deactivated.
  cart.items = cart.items.filter(i => i.product && i.product.isActive);
  return { cart, subtotal: subtotalOf(cart.items), itemCount: itemCountOf(cart.items) };
};

exports.add = async (userId, productId, quantity = 1) => {
  const product = await Product.findById(productId);
  if (!product || !product.isActive) throw new ApiError(404, 'Product not found');
  if (product.stock < quantity)      throw new ApiError(400, 'Insufficient stock');

  let cart = await cartRepo.findRaw(userId);
  if (!cart) cart = new Cart({ user: userId, items: [] });

  const existing = cart.items.find(i => i.product.toString() === productId);
  if (existing) {
    const newQty = existing.quantity + quantity;
    if (newQty > product.maxOrderQty) {
      throw new ApiError(400, `Max ${product.maxOrderQty} items allowed`);
    }
    existing.quantity = newQty;
  } else {
    cart.items.push({
      product: productId,
      quantity,
      price: product.price,
      name: product.name,
      image: product.images[0] || ''
    });
  }
  await cart.save();
  analytics.incrementCartAddition(userId, productId).catch(() => {});
  return { cart, itemCount: itemCountOf(cart.items) };
};

exports.update = async (userId, productId, quantity) => {
  const cart = await cartRepo.findRaw(userId);
  if (!cart) throw new ApiError(404, 'Cart not found');

  if (quantity <= 0) {
    cart.items = cart.items.filter(i => i.product.toString() !== productId);
  } else {
    const item = cart.items.find(i => i.product.toString() === productId);
    if (item) item.quantity = quantity;
  }
  await cart.save();
  return { cart, subtotal: subtotalOf(cart.items), itemCount: itemCountOf(cart.items) };
};

exports.remove = async (userId, productId) => {
  const cart = await cartRepo.findRaw(userId);
  if (!cart) throw new ApiError(404, 'Cart not found');
  cart.items = cart.items.filter(i => i.product.toString() !== productId);
  await cart.save();
  return { itemCount: itemCountOf(cart.items) };
};

exports.clear = (userId) => cartRepo.clear(userId);

// Persist a validated coupon onto the cart so the server (not the client)
// is the source of truth when an order is placed. Pass null to clear.
exports.applyCoupon = async (userId, coupon) => {
  const cart = await cartRepo.findRaw(userId);
  if (!cart) throw new ApiError(404, 'Cart not found');
  cart.coupon = coupon
    ? { code: coupon.code, discount: coupon.discount, type: coupon.type }
    : null;
  await cart.save();
  return { coupon: cart.coupon };
};
