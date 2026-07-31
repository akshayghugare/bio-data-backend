const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

const { Schema } = mongoose;

/** Option lists shared with the frontend through GET /api/meta/options. */
const GENDER = ['male', 'female'];
const MARITAL_STATUS = ['never_married', 'divorced', 'widowed'];
const RELIGION = ['hindu', 'muslim', 'christian', 'sikh', 'jain', 'buddhist', 'other'];
const DIET = ['vegetarian', 'non_vegetarian', 'eggetarian'];
const QUALIFICATION = ['high_school', 'diploma', 'bachelors', 'masters', 'doctorate', 'other'];

const userSchema = new Schema(
  {
    /* ── Account ─────────────────────────────────────────────────────── */
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Please enter a valid 10 digit phone number'],
    },
    password: { type: String, required: [true, 'Password is required'], minlength: 6, select: false },

    /* ── Basic details ───────────────────────────────────────────────── */
    gender: { type: String, enum: GENDER, required: true },
    dateOfBirth: { type: Date, required: true },
    /** Denormalised on save so age filters and sorts stay index-friendly. */
    age: { type: Number, min: 18, max: 80, index: true },

    height: { type: Number, min: 120, max: 220 },       // centimetres
    maritalStatus: { type: String, enum: MARITAL_STATUS },
    religion: { type: String, enum: RELIGION, index: true },
    caste: { type: String, trim: true, maxlength: 60 },
    motherTongue: { type: String, trim: true, maxlength: 40 },
    diet: { type: String, enum: DIET },

    /* ── Education & work ────────────────────────────────────────────── */
    qualification: { type: String, enum: QUALIFICATION },
    occupation: { type: String, trim: true, maxlength: 80 },
    annualIncome: { type: Number, min: 0 },

    /* ── Address (drives the search filters) ─────────────────────────── */
    address: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 60, index: true },
    district: { type: String, trim: true, maxlength: 60, index: true },
    state: { type: String, trim: true, maxlength: 60, index: true },
    pinCode: { type: String, trim: true, match: [/^\d{6}$/, 'PIN code must be 6 digits'], index: true },

    /* ── Family & about ──────────────────────────────────────────────── */
    fatherName: { type: String, trim: true, maxlength: 80 },
    motherName: { type: String, trim: true, maxlength: 80 },
    siblings: { type: Number, min: 0, max: 20, default: 0 },
    about: { type: String, trim: true, maxlength: 1000 },

    /* ── Photos ──────────────────────────────────────────────────────── */
    /** Main display picture shown on cards and the biodata header. */
    photo: { type: String, default: '' },
    /** Extra photos — a minimum count is required to complete the profile. */
    gallery: {
      type: [
        {
          url: { type: String, required: true },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    /* ── Display preferences ─────────────────────────────────────────── */
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      language: { type: String, enum: ['en', 'hi', 'mr'], default: 'en' },
    },

    /* ── Partner preference (powers the matching page) ───────────────── */
    partnerPreference: {
      ageMin: { type: Number, min: 18, max: 80 },
      ageMax: { type: Number, min: 18, max: 80 },
      religion: { type: String, enum: [...RELIGION, ''], default: '' },
      state: { type: String, trim: true, default: '' },
      maritalStatus: { type: String, enum: [...MARITAL_STATUS, ''], default: '' },
    },

    /* ── Email verification ──────────────────────────────────────────── */
    isEmailVerified: { type: Boolean, default: false, index: true },
    emailVerifiedAt: { type: Date, default: null },
    /** SHA-256 of the emailed token — the raw token never reaches the DB. */
    emailTokenHash: { type: String, default: null, select: false },
    emailTokenExpiresAt: { type: Date, default: null, select: false },
    /** Throttles "resend verification" so the inbox cannot be flooded. */
    emailSentAt: { type: Date, default: null, select: false },

    /* ── Flow flags ──────────────────────────────────────────────────── */
    isProfileComplete: { type: Boolean, default: false, index: true },
    isPaid: { type: Boolean, default: false, index: true },
    paidAt: { type: Date, default: null },

    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        return ret;
      },
    },
  }
);

/* ── Indexes ───────────────────────────────────────────────────────────── */
userSchema.index({ name: 'text', occupation: 'text', city: 'text' });
userSchema.index({ gender: 1, isProfileComplete: 1 });

/* ── Hooks ─────────────────────────────────────────────────────────────── */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

userSchema.pre('save', function computeAge(next) {
  if (this.dateOfBirth) {
    const diff = Date.now() - new Date(this.dateOfBirth).getTime();
    this.age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  }
  return next();
});

/**
 * A profile counts as complete only when every field the platform needs for
 * matching and searching is filled. This is what gates the dashboard.
 */
const REQUIRED_PROFILE_FIELDS = [
  'gender', 'dateOfBirth', 'height', 'maritalStatus', 'religion', 'caste', 'motherTongue',
  'diet', 'qualification', 'occupation', 'address', 'city', 'district', 'state', 'pinCode',
  'fatherName', 'motherName', 'about',
];

const isFilled = (value) => value !== undefined && value !== null && String(value).trim() !== '';

userSchema.pre('save', function markProfileComplete(next) {
  const fieldsFilled = REQUIRED_PROFILE_FIELDS.every((field) => isFilled(this[field]));
  const preferenceFilled = Boolean(this.partnerPreference?.ageMin && this.partnerPreference?.ageMax);
  // Photos are part of the requirement: one profile picture plus a full gallery.
  const photoFilled = isFilled(this.photo);
  const galleryFilled = (this.gallery?.length || 0) >= env.upload.minGalleryPhotos;

  this.isProfileComplete = fieldsFilled && preferenceFilled && photoFilled && galleryFilled;
  return next();
});

/* ── Methods ───────────────────────────────────────────────────────────── */
userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

/**
 * Issues a fresh email-verification token.
 * Returns the raw token for the email; only its hash is stored.
 */
userSchema.methods.createEmailToken = function createEmailToken(expiryHours = 24) {
  const raw = crypto.randomBytes(32).toString('hex');
  this.emailTokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  this.emailTokenExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
  this.emailSentAt = new Date();
  return raw;
};

userSchema.statics.hashEmailToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

/**
 * Percentage used by the progress bar.
 * Counts the text fields, the partner preference, the profile picture and each
 * required gallery slot, so uploading a photo visibly moves the bar.
 */
userSchema.methods.completionPercent = function completionPercent() {
  const minGallery = env.upload.minGalleryPhotos;

  const filled = REQUIRED_PROFILE_FIELDS.filter((field) => isFilled(this[field])).length;
  const preferenceFilled = this.partnerPreference?.ageMin && this.partnerPreference?.ageMax ? 1 : 0;
  const photoFilled = isFilled(this.photo) ? 1 : 0;
  const galleryFilled = Math.min(this.gallery?.length || 0, minGallery);

  const done = filled + preferenceFilled + photoFilled + galleryFilled;
  const total = REQUIRED_PROFILE_FIELDS.length + 1 + 1 + minGallery;

  return Math.round((done / total) * 100);
};

/** What is still missing — drives the checklist on the profile page. */
userSchema.methods.missingRequirements = function missingRequirements() {
  const missing = REQUIRED_PROFILE_FIELDS.filter((field) => !isFilled(this[field]));
  if (!(this.partnerPreference?.ageMin && this.partnerPreference?.ageMax)) missing.push('partnerPreference');
  if (!isFilled(this.photo)) missing.push('photo');

  const galleryCount = this.gallery?.length || 0;
  if (galleryCount < env.upload.minGalleryPhotos) missing.push('gallery');

  return {
    fields: missing,
    galleryCount,
    galleryRequired: env.upload.minGalleryPhotos,
    hasPhoto: isFilled(this.photo),
  };
};

module.exports = mongoose.model('User', userSchema);
module.exports.OPTIONS = { GENDER, MARITAL_STATUS, RELIGION, DIET, QUALIFICATION };
module.exports.REQUIRED_PROFILE_FIELDS = REQUIRED_PROFILE_FIELDS;
