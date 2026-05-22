const ApiError = require('../utils/ApiError');
const userRepo = require('../repositories/userRepository');

exports.getProfile = (userId) => userRepo.findByIdSafe(userId);

exports.updateProfile = (userId, { name, phone, preferences }) =>
  userRepo.updateProfile(userId, { name, phone, preferences });

exports.addAddress = async (userId, address) => {
  const user = await userRepo.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  if (address.isDefault) user.addresses.forEach(a => { a.isDefault = false; });
  if (user.addresses.length === 0) address.isDefault = true;
  user.addresses.push(address);
  await user.save();
  return user;
};

exports.updateAddress = async (userId, addressId, fields) => {
  const user = await userRepo.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  const addr = user.addresses.id(addressId);
  if (!addr) throw new ApiError(404, 'Address not found');
  if (fields.isDefault) user.addresses.forEach(a => { a.isDefault = false; });
  Object.assign(addr, fields);
  await user.save();
  return user;
};

exports.deleteAddress = async (userId, addressId) => {
  const user = await userRepo.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  user.addresses = user.addresses.filter(a => a._id.toString() !== addressId);
  await user.save();
  return user;
};

exports.listAll = (query) => userRepo.search(query);
