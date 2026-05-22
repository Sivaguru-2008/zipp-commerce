const ApiError = require('../utils/ApiError');
const cache = require('../utils/cache');
const { escapeRegex } = require('../utils/regex');
const repo = require('../repositories/productRepository');

const TTL_LIST   = 300;
const TTL_DETAIL = 120;

const KEY = {
  featured: 'products:featured',
  trending: 'products:trending',
  detail:   (idOrSlug) => `products:detail:${idOrSlug}`,
  // Used to wildcard-purge every cached detail entry on write.
  detailAll: 'products:detail:*'
};

function buildListFilter(q) {
  const { category, subcategory, brand, minPrice, maxPrice, search, q: q2,
          featured, badge, inStock, minRating, minDiscount } = q;
  const filter = { isActive: true };

  if (category)    filter.category = category;
  if (subcategory) filter.subcategory = subcategory;
  if (brand)       filter.brand = new RegExp(escapeRegex(brand), 'i');

  if (minPrice || maxPrice) filter.price = {};
  if (minPrice) filter.price.$gte = +minPrice;
  if (maxPrice) filter.price.$lte = +maxPrice;

  if (featured === 'true') filter.isFeatured = true;
  if (badge)               filter.badges = badge;
  if (inStock === 'true')  filter.stock = { $gt: 0 };

  const searchTerm = search || q2;
  if (searchTerm) {
    const escaped = escapeRegex(searchTerm);
    filter.$or = [
      { name:  new RegExp(escaped, 'i') },
      { brand: new RegExp(escaped, 'i') },
      { tags:  new RegExp(escaped, 'i') }
    ];
  }
  if (minRating)   filter.rating   = { $gte: +minRating };
  if (minDiscount) filter.discount = { $gte: +minDiscount };

  return filter;
}

function resolveSort(sort) {
  const sortMap = {
    price_asc: 'price', price_desc: '-price', discount: '-discount',
    rating: '-rating', newest: '-createdAt', popular: '-soldCount'
  };
  return sortMap[sort] || sort;
}

exports.list = async (query) => {
  const page  = +query.page  || 1;
  const limit = +query.limit || 20;
  const filter = buildListFilter(query);
  const sort   = resolveSort(query.sort || '-createdAt');

  const { total, products } = await repo.findList({
    filter, sort, limit, skip: (page - 1) * limit
  });

  return { products, total, page, pages: Math.ceil(total / limit) };
};

exports.search = async (q, limit = 10) => {
  if (!q) return [];
  const escaped = escapeRegex(q);
  return repo.search({
    isActive: true,
    $or: [
      { name:  new RegExp(escaped, 'i') },
      { brand: new RegExp(escaped, 'i') },
      { tags:  new RegExp(escaped, 'i') }
    ]
  }, +limit);
};

exports.featured = async () => {
  const cached = await cache.getCache(KEY.featured);
  if (cached) return cached;
  const products = await repo.findFeatured();
  await cache.setCache(KEY.featured, products, TTL_LIST);
  return products;
};

exports.trending = async () => {
  const cached = await cache.getCache(KEY.trending);
  if (cached) return cached;
  const products = await repo.findTrending();
  await cache.setCache(KEY.trending, products, TTL_LIST);
  return products;
};

exports.detail = async (idOrSlug) => {
  const cached = await cache.getCache(KEY.detail(idOrSlug));
  if (cached) return cached;
  const product = await repo.findByIdOrSlug(idOrSlug);
  if (!product) throw new ApiError(404, 'Product not found');
  await cache.setCache(KEY.detail(idOrSlug), product, TTL_DETAIL);
  return product;
};

async function invalidate() {
  await Promise.all([
    cache.deleteCache(KEY.featured),
    cache.deleteCache(KEY.trending),
    cache.deleteCache(KEY.detailAll)
  ]);
}

exports.invalidate = invalidate;

exports.create = async (data) => {
  const product = await repo.create(data);
  await invalidate();
  return product;
};

exports.update = async (id, data) => {
  const product = await repo.update(id, data);
  if (!product) throw new ApiError(404, 'Product not found');
  await invalidate();
  return product;
};

exports.softDelete = async (id) => {
  await repo.softDelete(id);
  await invalidate();
};

exports.KEY = KEY;
