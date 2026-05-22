const userService = require('../services/userService');

const toJSON = (user) => (user && user.toJSON ? user.toJSON() : user);

exports.getProfile = async (req, res) => {
  const user = await userService.getProfile(req.user._id);
  res.json({ success: true, user });
};

exports.updateProfile = async (req, res) => {
  const user = await userService.updateProfile(req.user._id, req.body);
  res.json({ success: true, message: 'Profile updated', user });
};

exports.addAddress = async (req, res) => {
  const user = await userService.addAddress(req.user._id, req.body);
  res.json({ success: true, message: 'Address added', user: toJSON(user) });
};

exports.updateAddress = async (req, res) => {
  const user = await userService.updateAddress(req.user._id, req.params.id, req.body);
  res.json({ success: true, message: 'Address updated', user: toJSON(user) });
};

exports.deleteAddress = async (req, res) => {
  const user = await userService.deleteAddress(req.user._id, req.params.id);
  res.json({ success: true, message: 'Address deleted', user: toJSON(user) });
};

exports.listAll = async (req, res) => {
  const result = await userService.listAll(req.query);
  res.json({ success: true, ...result });
};
