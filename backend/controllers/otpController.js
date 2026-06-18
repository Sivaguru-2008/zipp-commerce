const otpService = require('../services/otpService');

exports.send = async (req, res) => {
  const result = await otpService.send(req.user._id, {
    channel: req.body.channel,
    destination: req.body.destination
  });
  res.json({ success: true, ...result });
};

exports.verify = async (req, res) => {
  const result = await otpService.verify(req.user._id, req.body.code);
  res.json({ success: true, ...result });
};

exports.resend = async (req, res) => {
  const result = await otpService.resend(req.user._id);
  res.json({ success: true, ...result });
};
