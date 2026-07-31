const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/** Photos are stored on disk under backend/uploads and served at /uploads. */
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8) || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
  return cb(new ApiError(400, 'Only JPG, PNG and WebP images are allowed'));
};

const limits = {
  fileSize: env.upload.maxSizeMb * 1024 * 1024,
  files: env.upload.maxGalleryPhotos,
};

const upload = multer({ storage, fileFilter, limits });

/** Single profile picture — field name `photo`. */
const uploadPhoto = upload.single('photo');

/** Up to MAX_GALLERY_PHOTOS gallery images — field name `photos`. */
const uploadGallery = upload.array('photos', env.upload.maxGalleryPhotos);

/** Public URL for a stored file. */
const fileUrl = (filename) => `/uploads/${filename}`;

/** Best-effort delete — a stale file must never fail the request. */
function removeFile(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const filePath = path.join(UPLOAD_DIR, path.basename(url));
  fs.unlink(filePath, () => {});
}

/** Turns multer's own errors into the standard API error shape. */
function handleUploadError(error, req, res, next) {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `Each image must be smaller than ${env.upload.maxSizeMb} MB`
        : error.code === 'LIMIT_FILE_COUNT'
          ? `You can upload at most ${env.upload.maxGalleryPhotos} photos at once`
          : 'Could not upload the image';
    return next(new ApiError(400, message));
  }
  return next(error);
}

module.exports = { uploadPhoto, uploadGallery, handleUploadError, fileUrl, removeFile, UPLOAD_DIR };
