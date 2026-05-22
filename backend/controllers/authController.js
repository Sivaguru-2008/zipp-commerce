const authService = require('../services/authService');
const analytics = require('../utils/analytics');

exports.register = async (req, res) => {
  const { name, email, password, phone } = req.body;
  const result = await authService.register({ name, email, password, phone });
  res.status(201).json({ success: true, message: 'Account created successfully', ...result });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login({ email, password });
  // Best-effort analytics increment; never blocks the response.
  analytics.incrementLogin(result.user._id).catch(() => {});
  res.json({ success: true, message: 'Login successful', ...result });
};

exports.me = async (req, res) => {
  const user = await authService.me(req.user._id);
  res.json({ success: true, user });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user._id, currentPassword, newPassword);
  res.json({ success: true, message: 'Password changed successfully' });
};
