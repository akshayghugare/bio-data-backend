const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { buildAccess } = require('../middlewares/access.middleware');
const { fileUrl, removeFile } = require('../middlewares/upload.middleware');

/** Fields a member is allowed to change — everything else is ignored. */
const EDITABLE = [
  'name', 'height', 'maritalStatus', 'religion', 'caste', 'motherTongue', 'diet',
  'qualification', 'occupation', 'annualIncome',
  'address', 'city', 'district', 'state', 'pinCode',
  'fatherName', 'motherName', 'siblings', 'about',
];

/** Shared payload so every profile response looks the same to the client. */
const profilePayload = (user) => ({
  user: user.toJSON(),
  access: buildAccess(user),
  requirements: user.missingRequirements(),
  limits: {
    minGalleryPhotos: env.upload.minGalleryPhotos,
    maxGalleryPhotos: env.upload.maxGalleryPhotos,
    maxSizeMb: env.upload.maxSizeMb,
  },
});

/** GET /api/profile */
const getProfile = asyncHandler(async (req, res) => success(res, { data: profilePayload(req.user) }));

/** PUT /api/profile — save the profile form (partial updates are fine). */
const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  EDITABLE.forEach((field) => {
    if (req.body[field] !== undefined) user[field] = req.body[field];
  });

  if (req.body.dateOfBirth) user.dateOfBirth = req.body.dateOfBirth;

  if (req.body.partnerPreference) {
    user.partnerPreference = { ...user.partnerPreference?.toObject?.(), ...req.body.partnerPreference };
  }

  // The pre-save hooks recompute age and flip isProfileComplete.
  await user.save();

  const payload = profilePayload(user);

  return success(res, {
    message: payload.access.isProfileComplete ? 'Profile completed successfully' : 'Profile saved',
    data: payload,
  });
});

/** PATCH /api/profile/preferences — theme and language. */
const updatePreferences = asyncHandler(async (req, res) => {
  const { theme, language } = req.body;
  const user = await User.findById(req.user.id);

  if (theme) {
    if (!['light', 'dark', 'system'].includes(theme)) throw ApiError.badRequest('Invalid theme');
    user.preferences.theme = theme;
  }

  if (language) {
    if (!['en', 'hi', 'mr'].includes(language)) throw ApiError.badRequest('Invalid language');
    user.preferences.language = language;
  }

  await user.save();

  return success(res, { message: 'Preferences saved', data: { preferences: user.preferences } });
});

/** POST /api/profile/photo — upload or replace the profile picture. */
const uploadProfilePhoto = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please choose an image to upload');

  const user = await User.findById(req.user.id);

  // Replace: drop the previous file so uploads do not accumulate.
  if (user.photo) removeFile(user.photo);

  user.photo = fileUrl(req.file.filename);
  await user.save();

  return success(res, { message: 'Profile photo updated', data: profilePayload(user) });
});

/** POST /api/profile/gallery — add one or more gallery photos. */
const uploadGalleryPhotos = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (!files.length) throw ApiError.badRequest('Please choose at least one image to upload');

  const user = await User.findById(req.user.id);

  const remaining = env.upload.maxGalleryPhotos - user.gallery.length;
  if (remaining <= 0) {
    files.forEach((file) => removeFile(fileUrl(file.filename)));
    throw ApiError.badRequest(`You can keep at most ${env.upload.maxGalleryPhotos} gallery photos`);
  }

  // Accept what fits, discard the overflow rather than failing the whole upload.
  files.slice(0, remaining).forEach((file) => user.gallery.push({ url: fileUrl(file.filename) }));
  files.slice(remaining).forEach((file) => removeFile(fileUrl(file.filename)));

  await user.save();

  const added = Math.min(files.length, remaining);

  return success(res, {
    message: `${added} photo${added === 1 ? '' : 's'} added to your gallery`,
    data: profilePayload(user),
  });
});

/** DELETE /api/profile/gallery/:photoId */
const deleteGalleryPhoto = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  const photo = user.gallery.id(req.params.photoId);
  if (!photo) throw ApiError.notFound('Photo not found');

  removeFile(photo.url);
  photo.deleteOne();

  await user.save();

  return success(res, { message: 'Photo removed', data: profilePayload(user) });
});

/** PATCH /api/profile/gallery/:photoId/primary — promote a gallery photo. */
const setPrimaryPhoto = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  const photo = user.gallery.id(req.params.photoId);
  if (!photo) throw ApiError.notFound('Photo not found');

  // Swap: the old profile picture moves back into the gallery slot.
  const previous = user.photo;
  user.photo = photo.url;
  photo.url = previous || photo.url;

  if (!previous) photo.deleteOne();

  await user.save();

  return success(res, { message: 'Profile photo updated', data: profilePayload(user) });
});

module.exports = {
  getProfile,
  updateProfile,
  updatePreferences,
  uploadProfilePhoto,
  uploadGalleryPhotos,
  deleteGalleryPhoto,
  setPrimaryPhoto,
};
