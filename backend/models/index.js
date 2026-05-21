const mongoose = require('mongoose');

// CART
const cartItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  price: Number,
  name: String,
  image: String
});

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [cartItemSchema],
  coupon: { code: String, discount: Number, type: String },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

cartSchema.methods.getTotal = function() {
  return this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
};

// ORDER
const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: String,
  image: String,
  price: Number,
  quantity: Number,
  subtotal: Number
});

const orderStatusSchema = new mongoose.Schema({
  status: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [orderItemSchema],
  deliveryAddress: {
    fullName: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String,
    coordinates: { lat: Number, lng: Number }
  },
  pricing: {
    subtotal: Number,
    deliveryFee: Number,
    tax: Number,
    discount: Number,
    couponDiscount: Number,
    total: Number
  },
  payment: {
    method: { type: String, enum: ['cod', 'razorpay', 'wallet'], default: 'cod' },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    paidAt: Date
  },
  status: { type: String, enum: ['placed', 'confirmed', 'packed', 'picked', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'], default: 'placed' },
  statusHistory: [orderStatusSchema],
  coupon: { code: String, discount: Number },
  deliveryInstructions: String,
  estimatedDelivery: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  cancellationReason: String,
  invoice: String,
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  deliveryAgent: { name: String, phone: String, location: { lat: Number, lng: Number } },
  isRated: { type: Boolean, default: false }
}, { timestamps: true });

orderSchema.pre('save', function(next) {
  if (!this.orderNumber) {
    this.orderNumber = 'ZPP' + Date.now() + Math.floor(Math.random() * 1000);
  }
  next();
});

// REVIEW
const reviewSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: String,
  comment: String,
  images: [String],
  isVerified: { type: Boolean, default: false },
  helpful: { type: Number, default: 0 }
}, { timestamps: true });

// WISHLIST
const wishlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
}, { timestamps: true });

// COUPON
const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  description: String,
  type: { type: String, enum: ['percentage', 'fixed', 'free_delivery'], required: true },
  value: { type: Number, required: true },
  minOrderAmount: { type: Number, default: 0 },
  maxDiscount: Number,
  usageLimit: { type: Number, default: 100 },
  usedCount: { type: Number, default: 0 },
  userLimit: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  validFrom: { type: Date, default: Date.now },
  validTill: { type: Date, required: true },
  applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
}, { timestamps: true });

// WAREHOUSE
const warehouseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  type: { type: String, enum: ['warehouse', 'dark_store', 'fulfillment_center'], default: 'dark_store' },
  address: {
    line1: String,
    city: String,
    state: String,
    pincode: String
  },
  coordinates: { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
  serviceablePincodes: [String],
  serviceableRadius: { type: Number, default: 5 },
  isActive: { type: Boolean, default: true },
  operatingHours: { open: { type: String, default: '06:00' }, close: { type: String, default: '23:00' } },
  maxOrdersPerHour: { type: Number, default: 50 },
  avgPreparationTime: { type: Number, default: 8 },
  manager: { name: String, phone: String }
}, { timestamps: true });

// PAYMENT
const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  method: { type: String, enum: ['razorpay', 'cod', 'wallet'] },
  status: { type: String, enum: ['created', 'captured', 'failed', 'refunded'], default: 'created' },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  refundId: String,
  refundAmount: Number,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

// NOTIFICATION
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: String,
  message: String,
  type: { type: String, enum: ['order', 'offer', 'system', 'delivery'], default: 'system' },
  isRead: { type: Boolean, default: false },
  data: mongoose.Schema.Types.Mixed
}, { timestamps: true });

module.exports = {
  Cart: mongoose.model('Cart', cartSchema),
  Order: mongoose.model('Order', orderSchema),
  Review: mongoose.model('Review', reviewSchema),
  Wishlist: mongoose.model('Wishlist', wishlistSchema),
  Coupon: mongoose.model('Coupon', couponSchema),
  Warehouse: mongoose.model('Warehouse', warehouseSchema),
  Payment: mongoose.model('Payment', paymentSchema),
  Notification: mongoose.model('Notification', notificationSchema)
};
