const express = require('express');
const {
  getProfile,
  updateProfile,
  updatePreferences,
  uploadProfilePhoto,
  uploadGalleryPhotos,
  deleteGalleryPhoto,
  setPrimaryPhoto,
} = require('../controllers/profile.controller');
const { protect } = require('../middlewares/auth.middleware');
const { uploadPhoto, uploadGallery, handleUploadError } = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(protect);

router.get('/', getProfile);
router.put('/', updateProfile);
router.patch('/preferences', updatePreferences);

/* ── Photos ────────────────────────────────────────────────────────────── */
router.post('/photo', uploadPhoto, handleUploadError, uploadProfilePhoto);
router.post('/gallery', uploadGallery, handleUploadError, uploadGalleryPhotos);
router.delete('/gallery/:photoId', deleteGalleryPhoto);
router.patch('/gallery/:photoId/primary', setPrimaryPhoto);

module.exports = router;
