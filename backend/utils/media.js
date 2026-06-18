// Cloudinary URL helpers + responsive sizing.
//
// Given a stored URL (which may or may not be a Cloudinary URL), produce:
//   - cdnUrl(url, opts)   — single optimised URL (f_auto / q_auto + width)
//   - srcset(url, widths) — comma-separated `<img srcset>` value
//   - augment(product)    — convenience: returns the product with .imageSrcset
//     filled in for use by the frontend.
//
// Non-Cloudinary URLs (e.g. /uploads/foo.png, Unsplash links) are returned
// unchanged — the helpers are safe to call on every product.

const CLOUDINARY_HOST = 'res.cloudinary.com';
const DEFAULT_WIDTHS = [320, 640, 1080];

function isCloudinary(url) {
  return typeof url === 'string' && url.indexOf(CLOUDINARY_HOST) !== -1;
}

// Insert a transformation segment after `/upload/`. If transforms already
// exist, replace them so we don't double-stack.
function injectTransforms(url, transforms) {
  const idx = url.indexOf('/upload/');
  if (idx === -1) return url;
  const head = url.slice(0, idx + '/upload/'.length);
  let tail = url.slice(idx + '/upload/'.length);
  // Strip an existing transform segment (everything up to the first `/v123/`
  // version marker or filename).
  tail = tail.replace(/^([^/]+,)?[^/]*\//, m => {
    // Only strip if it looks like a transform (contains f_, q_, w_, c_, etc.)
    if (/^[a-z]_[^/]*/.test(m)) return '';
    return m;
  });
  return head + transforms + '/' + tail;
}

function cdnUrl(url, { width, height, crop = 'limit', format = 'auto', quality = 'auto' } = {}) {
  if (!isCloudinary(url)) return url;
  const parts = [];
  if (format)  parts.push(`f_${format}`);
  if (quality) parts.push(`q_${quality}`);
  if (width)   parts.push(`w_${width}`);
  if (height)  parts.push(`h_${height}`);
  if (crop)    parts.push(`c_${crop}`);
  return injectTransforms(url, parts.join(','));
}

function srcset(url, widths = DEFAULT_WIDTHS) {
  if (!isCloudinary(url)) return null;
  return widths.map(w => `${cdnUrl(url, { width: w })} ${w}w`).join(', ');
}

function augmentProduct(product) {
  if (!product) return product;
  const obj = product.toObject ? product.toObject() : { ...product };
  const images = obj.images || [];
  obj.imagesOptimised = images.map(u => ({
    src:    cdnUrl(u, { width: 640 }),
    srcset: srcset(u),
    sizes:  '(max-width: 600px) 320px, (max-width: 1200px) 640px, 1080px'
  }));
  return obj;
}

module.exports = { isCloudinary, cdnUrl, srcset, augmentProduct };
