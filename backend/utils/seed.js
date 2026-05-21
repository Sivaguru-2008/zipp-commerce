require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/zipp';

// Load models
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { Coupon, Warehouse } = require('../models/index');

const categories = [
  { name: 'Fruits & Vegetables', slug: 'fruits-vegetables', icon: '🥦', color: '#22c55e', image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=300', description: 'Fresh farm produce', sortOrder: 1 },
  { name: 'Dairy & Eggs', slug: 'dairy-eggs', icon: '🥛', color: '#f59e0b', image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300', description: 'Fresh dairy products', sortOrder: 2 },
  { name: 'Snacks & Beverages', slug: 'snacks-beverages', icon: '🍿', color: '#ef4444', image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=300', description: 'Munchies and drinks', sortOrder: 3 },
  { name: 'Bakery & Breads', slug: 'bakery-breads', icon: '🍞', color: '#d97706', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300', description: 'Fresh baked daily', sortOrder: 4 },
  { name: 'Meat & Seafood', slug: 'meat-seafood', icon: '🥩', color: '#dc2626', image: 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=300', description: 'Fresh meats & fish', sortOrder: 5 },
  { name: 'Personal Care', slug: 'personal-care', icon: '🧴', color: '#8b5cf6', image: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=300', description: 'Beauty & wellness', sortOrder: 6 },
  { name: 'Household', slug: 'household', icon: '🏠', color: '#06b6d4', image: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=300', description: 'Home essentials', sortOrder: 7 },
  { name: 'Baby Care', slug: 'baby-care', icon: '👶', color: '#ec4899', image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300', description: 'For your little ones', sortOrder: 8 },
  { name: 'Frozen Foods', slug: 'frozen-foods', icon: '🧊', color: '#3b82f6', image: 'https://images.unsplash.com/photo-1498557850523-fd3d118b962e?w=300', description: 'Quick frozen meals', sortOrder: 9 },
  { name: 'Organic & Health', slug: 'organic-health', icon: '🌿', color: '#16a34a', image: 'https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=300', description: 'Healthy choices', sortOrder: 10 },
];

const warehouses = [
  {
    name: 'Zipp Dark Store - HSR Layout',
    code: 'ZPP-HSR-01',
    type: 'dark_store',
    address: { line1: '27 HSR Layout', city: 'Bangalore', state: 'Karnataka', pincode: '560102' },
    coordinates: { lat: 12.9116, lng: 77.6389 },
    serviceablePincodes: ['560102', '560034', '560047', '560068', '560029'],
    serviceableRadius: 6,
    isActive: true,
    avgPreparationTime: 8,
    manager: { name: 'Suresh Kumar', phone: '9876543210' }
  },
  {
    name: 'Zipp Dark Store - Koramangala',
    code: 'ZPP-KOR-02',
    type: 'dark_store',
    address: { line1: '5th Block, Koramangala', city: 'Bangalore', state: 'Karnataka', pincode: '560095' },
    coordinates: { lat: 12.9352, lng: 77.6245 },
    serviceablePincodes: ['560095', '560034', '560047', '560030'],
    serviceableRadius: 5,
    isActive: true,
    avgPreparationTime: 10,
    manager: { name: 'Priya Rajan', phone: '9876543211' }
  },
  {
    name: 'Zipp Fulfillment Center - Whitefield',
    code: 'ZPP-WFD-03',
    type: 'fulfillment_center',
    address: { line1: 'ITPL Main Road, Whitefield', city: 'Bangalore', state: 'Karnataka', pincode: '560066' },
    coordinates: { lat: 12.9698, lng: 77.7500 },
    serviceablePincodes: ['560066', '560037', '560048'],
    serviceableRadius: 8,
    isActive: true,
    avgPreparationTime: 12,
    manager: { name: 'Amit Sharma', phone: '9876543212' }
  }
];

const coupons = [
  { code: 'ZIPP10', description: '10% off on first order', type: 'percentage', value: 10, minOrderAmount: 199, maxDiscount: 100, usageLimit: 1000, validTill: new Date('2025-12-31') },
  { code: 'SAVE50', description: 'Flat ₹50 off', type: 'fixed', value: 50, minOrderAmount: 299, usageLimit: 500, validTill: new Date('2025-12-31') },
  { code: 'FREEDEL', description: 'Free delivery on any order', type: 'free_delivery', value: 40, minOrderAmount: 0, usageLimit: 200, validTill: new Date('2025-12-31') },
  { code: 'NEWUSER', description: '20% off for new users', type: 'percentage', value: 20, minOrderAmount: 399, maxDiscount: 150, usageLimit: 1000, validTill: new Date('2025-12-31') },
  { code: 'WEEKEND20', description: '20% weekend special', type: 'percentage', value: 20, minOrderAmount: 499, maxDiscount: 200, usageLimit: 300, validTill: new Date('2025-12-31') },
];

function getProducts(categoryMap) {
  return [
    // Fruits & Vegetables
    { name: 'Fresh Bananas', brand: 'Farm Fresh', category: categoryMap['fruits-vegetables'], price: 49, mrp: 60, discount: 18, images: ['https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400'], stock: 200, unit: '500g', deliveryTime: '10 mins', tags: ['fresh', 'fruit'], badges: ['Best Seller'], isFeatured: true, soldCount: 450 },
    { name: 'Red Onions', brand: 'Farm Fresh', category: categoryMap['fruits-vegetables'], price: 35, mrp: 45, discount: 22, images: ['https://images.unsplash.com/photo-1518977956812-cd3dbadaaf31?w=400'], stock: 150, unit: '1kg', deliveryTime: '10 mins', tags: ['vegetable', 'fresh'] },
    { name: 'Tomatoes', brand: 'Farm Direct', category: categoryMap['fruits-vegetables'], price: 40, mrp: 55, discount: 27, images: ['https://images.unsplash.com/photo-1546094096-0df4bcaad337?w=400'], stock: 120, unit: '500g', deliveryTime: '10 mins', tags: ['vegetable', 'fresh'], isFeatured: true },
    { name: 'Spinach (Palak)', brand: 'Farm Fresh', category: categoryMap['fruits-vegetables'], price: 25, mrp: 30, discount: 17, images: ['https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400'], stock: 80, unit: '250g', deliveryTime: '10 mins', tags: ['vegetable', 'leafy green'] },
    { name: 'Green Apple', brand: 'Imported', category: categoryMap['fruits-vegetables'], price: 149, mrp: 180, discount: 17, images: ['https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=400'], stock: 60, unit: '4 pcs', deliveryTime: '10 mins', tags: ['fruit', 'imported'], badges: ['Premium'] },
    { name: 'Mango Alphonso', brand: 'Ratnagiri', category: categoryMap['fruits-vegetables'], price: 299, mrp: 350, discount: 15, images: ['https://images.unsplash.com/photo-1553279768-865429fa0078?w=400'], stock: 40, unit: '1kg', deliveryTime: '15 mins', tags: ['fruit', 'seasonal'], isFeatured: true, badges: ['Seasonal'] },
    { name: 'Capsicum Mix', brand: 'Farm Fresh', category: categoryMap['fruits-vegetables'], price: 69, mrp: 90, discount: 23, images: ['https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400'], stock: 70, unit: '3 pcs', deliveryTime: '10 mins', tags: ['vegetable'] },
    { name: 'Broccoli', brand: 'Farm Direct', category: categoryMap['fruits-vegetables'], price: 89, mrp: 120, discount: 26, images: ['https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?w=400'], stock: 50, unit: '400g', deliveryTime: '10 mins', tags: ['vegetable', 'healthy'], badges: ['Healthy'] },

    // Dairy & Eggs
    { name: 'Amul Gold Milk', brand: 'Amul', category: categoryMap['dairy-eggs'], price: 31, mrp: 34, discount: 9, images: ['https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400'], stock: 300, unit: '500ml', deliveryTime: '8 mins', tags: ['milk', 'dairy'], isFeatured: true, soldCount: 800 },
    { name: 'Farm Eggs (6 pcs)', brand: 'Country Hen', category: categoryMap['dairy-eggs'], price: 65, mrp: 78, discount: 17, images: ['https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=400'], stock: 200, unit: '6 eggs', deliveryTime: '8 mins', tags: ['eggs', 'protein'], isFeatured: true, badges: ['Best Seller'] },
    { name: 'Greek Yogurt', brand: "Epigamia", category: categoryMap['dairy-eggs'], price: 89, mrp: 110, discount: 19, images: ['https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400'], stock: 90, unit: '400g', deliveryTime: '10 mins', tags: ['dairy', 'healthy'], badges: ['Trending'] },
    { name: 'Amul Butter', brand: 'Amul', category: categoryMap['dairy-eggs'], price: 55, mrp: 60, discount: 8, images: ['https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400'], stock: 150, unit: '100g', deliveryTime: '8 mins', tags: ['dairy', 'butter'] },
    { name: 'Paneer Fresh', brand: 'Milky Mist', category: categoryMap['dairy-eggs'], price: 89, mrp: 110, discount: 19, images: ['https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400'], stock: 100, unit: '200g', deliveryTime: '10 mins', tags: ['dairy', 'paneer'], isFeatured: true },
    { name: 'Cheddar Cheese', brand: 'Amul', category: categoryMap['dairy-eggs'], price: 169, mrp: 199, discount: 15, images: ['https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400'], stock: 60, unit: '200g', deliveryTime: '10 mins', tags: ['dairy', 'cheese'] },

    // Snacks & Beverages
    { name: "Lay's Classic Salted", brand: "Lay's", category: categoryMap['snacks-beverages'], price: 20, mrp: 20, discount: 0, images: ['https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400'], stock: 500, unit: '26g', deliveryTime: '8 mins', tags: ['chips', 'snacks'], soldCount: 1200 },
    { name: 'Coca Cola', brand: 'Coca Cola', category: categoryMap['snacks-beverages'], price: 40, mrp: 45, discount: 11, images: ['https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=400'], stock: 400, unit: '750ml', deliveryTime: '8 mins', tags: ['drink', 'beverages'], isFeatured: true },
    { name: 'Maggi Noodles', brand: 'Maggi', category: categoryMap['snacks-beverages'], price: 14, mrp: 14, discount: 0, images: ['https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400'], stock: 600, unit: '70g', deliveryTime: '8 mins', tags: ['noodles', 'instant'], soldCount: 2000, badges: ['Best Seller'] },
    { name: 'Bisleri Water', brand: 'Bisleri', category: categoryMap['snacks-beverages'], price: 20, mrp: 20, discount: 0, images: ['https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400'], stock: 1000, unit: '1L', deliveryTime: '8 mins', tags: ['water', 'drinks'] },
    { name: 'Red Bull Energy', brand: 'Red Bull', category: categoryMap['snacks-beverages'], price: 115, mrp: 130, discount: 12, images: ['https://images.unsplash.com/photo-1595981267035-7b04ca84a82d?w=400'], stock: 150, unit: '250ml', deliveryTime: '8 mins', tags: ['energy drink'], badges: ['Premium'] },
    { name: 'Oreo Cookies', brand: 'Oreo', category: categoryMap['snacks-beverages'], price: 30, mrp: 35, discount: 14, images: ['https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400'], stock: 300, unit: '120g', deliveryTime: '8 mins', tags: ['cookies', 'biscuits'], isFeatured: true, soldCount: 900 },
    { name: 'Tropicana Orange', brand: 'Tropicana', category: categoryMap['snacks-beverages'], price: 85, mrp: 99, discount: 14, images: ['https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400'], stock: 200, unit: '1L', deliveryTime: '8 mins', tags: ['juice', 'beverages'] },

    // Bakery
    { name: 'Britannia Brown Bread', brand: 'Britannia', category: categoryMap['bakery-breads'], price: 40, mrp: 45, discount: 11, images: ['https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400'], stock: 150, unit: '400g', deliveryTime: '10 mins', tags: ['bread', 'bakery'], soldCount: 600, isFeatured: true },
    { name: 'Croissant Butter', brand: 'Artisan Bakery', category: categoryMap['bakery-breads'], price: 45, mrp: 55, discount: 18, images: ['https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400'], stock: 60, unit: '2 pcs', deliveryTime: '15 mins', tags: ['bakery', 'croissant'], badges: ['Fresh Daily'] },
    { name: 'Whole Wheat Roti', brand: 'Naturals', category: categoryMap['bakery-breads'], price: 55, mrp: 65, discount: 15, images: ['https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400'], stock: 100, unit: '10 pcs', deliveryTime: '10 mins', tags: ['roti', 'healthy'] },

    // Meat & Seafood
    { name: 'Chicken Breast', brand: 'Fresh Farm', category: categoryMap['meat-seafood'], price: 199, mrp: 240, discount: 17, images: ['https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400'], stock: 80, unit: '500g', deliveryTime: '20 mins', tags: ['chicken', 'protein'], isFeatured: true },
    { name: 'Rohu Fish', brand: 'Ocean Fresh', category: categoryMap['meat-seafood'], price: 159, mrp: 200, discount: 21, images: ['https://images.unsplash.com/photo-1544943910-4c1dc44aab44?w=400'], stock: 50, unit: '500g', deliveryTime: '20 mins', tags: ['fish', 'seafood'] },
    { name: 'Mutton Keema', brand: 'Fresh Farms', category: categoryMap['meat-seafood'], price: 349, mrp: 420, discount: 17, images: ['https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=400'], stock: 40, unit: '500g', deliveryTime: '25 mins', tags: ['mutton', 'keema'], badges: ['Premium'] },

    // Personal Care
    { name: 'Dove Soap', brand: 'Dove', category: categoryMap['personal-care'], price: 49, mrp: 58, discount: 16, images: ['https://images.unsplash.com/photo-1602928309046-e4deff00b756?w=400'], stock: 250, unit: '100g', deliveryTime: '15 mins', tags: ['soap', 'skincare'] },
    { name: 'Colgate Total', brand: 'Colgate', category: categoryMap['personal-care'], price: 99, mrp: 120, discount: 18, images: ['https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=400'], stock: 200, unit: '150g', deliveryTime: '15 mins', tags: ['toothpaste', 'dental'], soldCount: 700 },
    { name: 'Head & Shoulders Shampoo', brand: 'H&S', category: categoryMap['personal-care'], price: 199, mrp: 249, discount: 20, images: ['https://images.unsplash.com/photo-1585751119414-ef2636f8aede?w=400'], stock: 120, unit: '200ml', deliveryTime: '15 mins', tags: ['shampoo', 'hair care'], isFeatured: true },
    { name: 'Nivea Body Lotion', brand: 'Nivea', category: categoryMap['personal-care'], price: 249, mrp: 299, discount: 17, images: ['https://images.unsplash.com/photo-1612817288484-6f916006741a?w=400'], stock: 90, unit: '400ml', deliveryTime: '15 mins', tags: ['skincare', 'lotion'], badges: ['Best Seller'] },

    // Household
    { name: 'Surf Excel Matic', brand: 'Surf Excel', category: categoryMap['household'], price: 399, mrp: 480, discount: 17, images: ['https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=400'], stock: 150, unit: '2kg', deliveryTime: '15 mins', tags: ['detergent', 'cleaning'], isFeatured: true },
    { name: 'Vim Dishwash Gel', brand: 'Vim', category: categoryMap['household'], price: 99, mrp: 120, discount: 18, images: ['https://images.unsplash.com/photo-1585515320310-259814833e62?w=400'], stock: 200, unit: '500ml', deliveryTime: '15 mins', tags: ['dish wash', 'cleaning'] },
    { name: 'Colin Glass Cleaner', brand: 'Colin', category: categoryMap['household'], price: 149, mrp: 175, discount: 15, images: ['https://images.unsplash.com/photo-1563453392212-326f5e854473?w=400'], stock: 100, unit: '500ml', deliveryTime: '15 mins', tags: ['cleaning', 'household'] },
    { name: 'Harpic Toilet Cleaner', brand: 'Harpic', category: categoryMap['household'], price: 89, mrp: 110, discount: 19, images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400'], stock: 130, unit: '500ml', deliveryTime: '15 mins', tags: ['cleaning', 'toilet'] },

    // Organic & Health
    { name: 'Organic Honey', brand: 'Dabur', category: categoryMap['organic-health'], price: 299, mrp: 380, discount: 21, images: ['https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400'], stock: 70, unit: '250g', deliveryTime: '15 mins', tags: ['organic', 'honey', 'health'], isFeatured: true, badges: ['Organic'] },
    { name: 'Quinoa Seeds', brand: 'True Elements', category: categoryMap['organic-health'], price: 349, mrp: 450, discount: 22, images: ['https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400'], stock: 50, unit: '500g', deliveryTime: '15 mins', tags: ['superfoods', 'healthy'], badges: ['Superfood'] },
    { name: 'Whey Protein', brand: 'MuscleBlaze', category: categoryMap['organic-health'], price: 1299, mrp: 1800, discount: 28, images: ['https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400'], stock: 40, unit: '500g', deliveryTime: '20 mins', tags: ['protein', 'fitness'], badges: ['Best Seller'] },

    // Frozen
    { name: 'McCain Fries', brand: 'McCain', category: categoryMap['frozen-foods'], price: 149, mrp: 180, discount: 17, images: ['https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400'], stock: 100, unit: '420g', deliveryTime: '12 mins', tags: ['frozen', 'fries'], soldCount: 500, isFeatured: true },
    { name: 'Frozen Peas', brand: 'Green Farms', category: categoryMap['frozen-foods'], price: 79, mrp: 99, discount: 20, images: ['https://images.unsplash.com/photo-1587735243615-c03f25aaff15?w=400'], stock: 120, unit: '500g', deliveryTime: '12 mins', tags: ['frozen', 'vegetables'] },
  ];
}

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Product.deleteMany({}),
      Category.deleteMany({}),
      Coupon.deleteMany({}),
      Warehouse.deleteMany({})
    ]);
    console.log('🗑️  Cleared existing data');

    // Create categories
    const createdCategories = await Category.insertMany(categories);
    console.log(`✅ Created ${createdCategories.length} categories`);
    const categoryMap = {};
    createdCategories.forEach(c => { categoryMap[c.slug] = c._id; });

    // Create warehouses
    const createdWarehouses = await Warehouse.insertMany(warehouses);
    console.log(`✅ Created ${createdWarehouses.length} warehouses`);

    // Create products
    const productsData = getProducts(categoryMap).map(p => {
      p.slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).substring(2, 7);
      if (p.mrp > 0) {
        p.discount = Math.round(((p.mrp - p.price) / p.mrp) * 100);
      }
      return p;
    });
    const createdProducts = await Product.insertMany(productsData);
    console.log(`✅ Created ${createdProducts.length} products`);

    // Create coupons
    await Coupon.insertMany(coupons);
    console.log(`✅ Created ${coupons.length} coupons`);

    // Create admin user
    const adminPassword = await bcrypt.hash('password123', 10);
    await User.create({
      name: 'Admin User',
      email: 'admin@example.com',
      password: adminPassword,
      role: 'admin',
      phone: '9999999999',
      isVerified: true
    });

    // Create sample user
    const userPassword = await bcrypt.hash('user123', 10);
    await User.create({
      name: 'John Doe',
      email: 'user@example.com',
      password: userPassword,
      role: 'user',
      phone: '9876543210',
      isVerified: true,
      addresses: [{
        label: 'Home',
        fullName: 'John Doe',
        phone: '9876543210',
        addressLine1: '12 HSR Layout',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560102',
        isDefault: true
      }]
    });
    console.log('✅ Created admin and sample user');

    console.log('\n🎉 Seed complete!');
    console.log('📦 Admin: admin@example.com / password123');
    console.log('👤 User: user@example.com / user123');
    console.log(`📊 ${createdProducts.length} products, ${createdCategories.length} categories, ${createdWarehouses.length} warehouses`);
    console.log('\n🚀 Run: cd backend && npm run dev');

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  }
}

seed();
