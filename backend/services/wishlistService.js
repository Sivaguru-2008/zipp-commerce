const wishlistRepo = require('../repositories/wishlistRepository');
const { Wishlist } = require('../models');

exports.get = async (userId) => {
  const wishlist = await wishlistRepo.findOrCreate(userId);
  return wishlist.products;
};

exports.toggle = async (userId, productId) => {
  let wishlist = await wishlistRepo.findRaw(userId);
  if (!wishlist) wishlist = new Wishlist({ user: userId, products: [] });

  // ObjectId vs string compare bug — fixed in Sprint 1; use .toString().
  const idx = wishlist.products.findIndex(p => p.toString() === productId);
  const added = idx === -1;
  if (added) wishlist.products.push(productId);
  else       wishlist.products.splice(idx, 1);

  await wishlist.save();
  return { added };
};

exports.remove = (userId, productId) => wishlistRepo.removeProduct(userId, productId);
