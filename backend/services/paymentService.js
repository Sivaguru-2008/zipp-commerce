const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');
const sentry = require('../utils/sentry');
const { Payment, Order } = require('../models');

const isDemoMode = () =>
  !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === 'your_razorpay_key_id';

// Owner-scoped order lookup — every payment operation requires the caller to
// own the order. This blocks an attacker from creating/verifying a Razorpay
// intent for somebody else's pending COD order.
async function getOwnedOrder(orderId, userId) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.user.toString() !== userId.toString()) {
    throw new ApiError(403, 'Not allowed for this order');
  }
  return order;
}

exports.createOrder = async (userId, orderId) => {
  const order = await getOwnedOrder(orderId, userId);

  // Reject any second attempt to start payment for an already-paid order.
  if (order.payment.status === 'paid') {
    throw new ApiError(409, 'Order is already paid');
  }
  // If the order is cancelled, don't let the user pay for it.
  if (order.status === 'cancelled') {
    throw new ApiError(400, 'Order has been cancelled');
  }

  if (isDemoMode()) {
    return {
      razorpayOrderId: 'order_demo_' + Date.now(),
      amount: order.pricing.total * 100,
      currency: 'INR',
      key: 'demo_key',
      demo: true
    };
  }

  // Reuse an existing Razorpay order if we already created one — avoids the
  // "user closed the modal and tried again" → orphaned Razorpay orders.
  if (order.payment.razorpayOrderId) {
    return {
      razorpayOrderId: order.payment.razorpayOrderId,
      amount: order.pricing.total * 100,
      currency: 'INR',
      key: process.env.RAZORPAY_KEY_ID
    };
  }

  const Razorpay = require('razorpay');
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

  const razorpayOrder = await razorpay.orders.create({
    amount: order.pricing.total * 100,
    currency: 'INR',
    receipt: order.orderNumber
  });

  order.payment.razorpayOrderId = razorpayOrder.id;
  await order.save();

  return {
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    key: process.env.RAZORPAY_KEY_ID
  };
};

exports.verify = async (userId, payload) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = payload;

  sentry.addBreadcrumb({
    category: 'payment',
    message: 'verify:start',
    data: { orderId: String(orderId), razorpayOrderId: razorpay_order_id }
  });

  const order = await getOwnedOrder(orderId, userId);

  // Idempotency: if the order is already paid for this payment id, do
  // nothing and return success. Prevents double-capture, double-credit, and
  // duplicate Payment rows on client retries / network replays.
  if (order.payment.status === 'paid'
      && order.payment.razorpayPaymentId === razorpay_payment_id) {
    return { idempotent: true };
  }
  if (order.payment.status === 'paid'
      && order.payment.razorpayPaymentId
      && order.payment.razorpayPaymentId !== razorpay_payment_id) {
    throw new ApiError(409, 'Order already paid with a different payment');
  }

  // HMAC verification only runs when we have a real Razorpay secret.
  if (!isDemoMode()) {
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(String(razorpay_signature || ''), 'utf8');
    const isValid = expectedBuf.length === signatureBuf.length && crypto.timingSafeEqual(expectedBuf, signatureBuf);

    if (!isValid) {
      metrics.recordPaymentFailure('signature_mismatch').catch(() => {});
      sentry.captureMessage('Payment signature mismatch', 'warning', {
        tags: { stage: 'verify' },
        extra: { orderId: String(orderId), razorpayOrderId: razorpay_order_id, userId: String(userId) }
      });
      throw new ApiError(400, 'Payment verification failed');
    }
  }

  order.payment.status = 'paid';
  order.payment.razorpayPaymentId = razorpay_payment_id;
  order.payment.razorpaySignature = razorpay_signature;
  order.payment.paidAt = new Date();
  await order.save();

  // Unique index on razorpayPaymentId would be ideal — until then use
  // updateOne with upsert so retries don't insert duplicates.
  await Payment.updateOne(
    { razorpayPaymentId: razorpay_payment_id },
    {
      $setOnInsert: {
        user: userId,
        order: orderId,
        amount: order.pricing.total,
        method: 'razorpay',
        status: 'captured',
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id
      }
    },
    { upsert: true }
  );
  return { idempotent: false };
};

// Best-effort Razorpay refund. Marks the payment row + order regardless so
// the user-facing state is consistent; the refund_id field tells finance
// whether it actually went through.
exports.refund = async (order) => {
  if (order.payment.method !== 'razorpay' || order.payment.status !== 'paid') return;
  const paymentId = order.payment.razorpayPaymentId;
  if (!paymentId) return;

  let refundId = null;
  if (!isDemoMode()) {
    try {
      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
      });
      const refund = await razorpay.payments.refund(paymentId, {
        amount: order.pricing.total * 100,
        speed: 'normal'
      });
      refundId = refund.id;
    } catch (err) {
      logger.error({ err: err.message, orderId: order._id }, 'Razorpay refund failed');
      metrics.recordPaymentFailure('refund_failed').catch(() => {});
      sentry.captureException(err, {
        tags: { stage: 'refund' },
        extra: { orderId: String(order._id), razorpayPaymentId: paymentId }
      });
      // Don't throw — order state must reflect cancellation either way.
    }
  } else {
    refundId = 'rfnd_demo_' + Date.now();
  }

  order.payment.status = 'refunded';
  await order.save();
  await Payment.updateOne(
    { razorpayPaymentId: paymentId },
    { $set: { status: 'refunded', refundId, refundAmount: order.pricing.total } }
  );
};

exports.history = (userId) =>
  Payment.find({ user: userId }).sort('-createdAt').populate('order', 'orderNumber status');
