const multer = require('multer');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

const CLOUDINARY_CONFIGURED =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_KEY !== 'your_cloudinary_api_key';

if (CLOUDINARY_CONFIGURED) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Custom Multer storage engine for Cloudinary v2 — streams the file straight
// to Cloudinary so we never write a temp file to disk.
//
// Upload-time eager transforms:
//   - f_auto: best-fit format per client (webp/avif when supported)
//   - q_auto: perceptual quality compression
//   - eager renders 320 / 640 / 1080 widths so the Cloudinary CDN serves
//     responsive variants without per-request transform charges
const cloudinaryStorage = {
  _handleFile(req, file, cb) {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'zipp-products',
        resource_type: 'auto',
        // Always apply f_auto + q_auto on delivery; eager warms the variants.
        transformation: [{ fetch_format: 'auto', quality: 'auto' }],
        eager: [
          { width: 320,  crop: 'limit', fetch_format: 'auto', quality: 'auto' },
          { width: 640,  crop: 'limit', fetch_format: 'auto', quality: 'auto' },
          { width: 1080, crop: 'limit', fetch_format: 'auto', quality: 'auto' }
        ],
        eager_async: true
      },
      (err, result) => {
        if (err) return cb(err);
        cb(null, { path: result.secure_url, filename: result.public_id, size: result.bytes });
      }
    );
    file.stream.pipe(uploadStream);
  },
  _removeFile(req, file, cb) {
    if (file.filename) cloudinary.uploader.destroy(file.filename, cb);
    else cb(null);
  }
};

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename:    (req, file, cb) => cb(null, 'product-' + Date.now() + path.extname(file.originalname))
});

// MIME-type whitelist — Multer's `mimetype` reflects what the client claims,
// but combined with Cloudinary's server-side validation it gives a defense-
// in-depth check against `evil.exe` renamed to `evil.exe.jpg`.
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'
]);

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    const err = new Error('Unsupported file type — JPEG/PNG/WebP/GIF/AVIF only');
    err.status = 400;
    return cb(err, false);
  }
  cb(null, true);
}

const upload = multer({
  storage: CLOUDINARY_CONFIGURED ? cloudinaryStorage : diskStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter
});

// Routes need to know which storage backend won so they can build the right
// image URL (Cloudinary returns full https URL; disk needs /uploads/ prefix).
module.exports = { upload, CLOUDINARY_CONFIGURED };
