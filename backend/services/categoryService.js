const ApiError = require('../utils/ApiError');
const cache = require('../utils/cache');
const repo = require('../repositories/categoryRepository');

const TTL_LIST = 300;
const KEY = { list: 'categories:list' };

exports.list = async () => {
  const cached = await cache.getCache(KEY.list);
  if (cached) return cached;
  const categories = await repo.findAll();
  await cache.setCache(KEY.list, categories, TTL_LIST);
  return categories;
};

exports.get = async (id) => {
  const cat = await repo.findById(id);
  if (!cat) throw new ApiError(404, 'Category not found');
  return cat;
};

async function invalidate() {
  await cache.deleteCache(KEY.list);
}

exports.create = async ({ name, description, icon, color, image }) => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const cat = await repo.create({ name, slug, description, icon, color, image });
  await invalidate();
  return cat;
};

exports.update = async (id, data) => {
  const cat = await repo.update(id, data);
  if (!cat) throw new ApiError(404, 'Category not found');
  await invalidate();
  return cat;
};

exports.softDelete = async (id) => {
  await repo.softDelete(id);
  await invalidate();
};

exports.KEY = KEY;
