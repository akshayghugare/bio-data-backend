const User = require('../models/User');
const Interest = require('../models/Interest');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, paginated } = require('../utils/response');

/** Fields returned in listings — never the password or e-mail of other members. */
const CARD_FIELDS =
  'name gender age height maritalStatus religion caste motherTongue diet qualification occupation city district state pinCode photo about createdAt';

/** Escapes user text before it is used inside a RegExp. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Turns query params into a Mongo filter.
 * Only complete profiles of the opposite gender are ever browsable.
 */
function buildFilter(currentUser, query) {
  const filter = {
    _id: { $ne: currentUser._id },
    isProfileComplete: true,
    gender: currentUser.gender === 'male' ? 'female' : 'male',
  };

  if (query.name) filter.name = new RegExp(escapeRegex(query.name.trim()), 'i');

  const ageMin = Number(query.ageMin);
  const ageMax = Number(query.ageMax);
  if (ageMin || ageMax) {
    filter.age = {};
    if (ageMin) filter.age.$gte = ageMin;
    if (ageMax) filter.age.$lte = ageMax;
  }

  // "Address" searches the free-text address plus the city, so one box works.
  if (query.address) {
    const rx = new RegExp(escapeRegex(query.address.trim()), 'i');
    filter.$or = [{ address: rx }, { city: rx }];
  }

  if (query.state) filter.state = new RegExp(`^${escapeRegex(query.state.trim())}$`, 'i');
  if (query.district) filter.district = new RegExp(`^${escapeRegex(query.district.trim())}$`, 'i');
  if (query.pinCode) filter.pinCode = query.pinCode.trim();
  if (query.religion) filter.religion = query.religion;
  if (query.maritalStatus) filter.maritalStatus = query.maritalStatus;

  return filter;
}

/** Adds `interestSent` so the card can show "Interest sent" instead of the button. */
async function decorate(members, currentUserId) {
  if (!members.length) return members;

  const ids = members.map((member) => member._id);
  const sent = await Interest.find({ from: currentUserId, to: { $in: ids } }).select('to').lean();
  const sentSet = new Set(sent.map((item) => String(item.to)));

  return members.map((member) => ({ ...member, interestSent: sentSet.has(String(member._id)) }));
}

/** GET /api/members — search, filter and paginate. */
const listMembers = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);

  const filter = buildFilter(req.user, req.query);
  const sort = { newest: { createdAt: -1 }, ageAsc: { age: 1 }, ageDesc: { age: -1 } }[req.query.sort] || { createdAt: -1 };

  const [rows, total] = await Promise.all([
    User.find(filter).select(CARD_FIELDS).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  const items = await decorate(rows, req.user._id);

  return paginated(res, { items, page, limit, total, message: 'Members loaded' });
});

/**
 * GET /api/members/matches
 * Members that fit the signed-in user's saved partner preference.
 */
const listMatches = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);

  const preference = req.user.partnerPreference || {};
  const filter = buildFilter(req.user, {});

  if (preference.ageMin || preference.ageMax) {
    filter.age = {};
    if (preference.ageMin) filter.age.$gte = preference.ageMin;
    if (preference.ageMax) filter.age.$lte = preference.ageMax;
  }
  if (preference.religion) filter.religion = preference.religion;
  if (preference.maritalStatus) filter.maritalStatus = preference.maritalStatus;
  if (preference.state) filter.state = new RegExp(`^${escapeRegex(preference.state)}$`, 'i');

  const [rows, total] = await Promise.all([
    User.find(filter).select(CARD_FIELDS).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  const items = await decorate(rows, req.user._id);

  return paginated(res, { items, page, limit, total, message: 'Matches loaded' });
});

/** GET /api/members/:id — full biodata of one member. */
const getMember = asyncHandler(async (req, res) => {
  const member = await User.findOne({ _id: req.params.id, isProfileComplete: true })
    .select(`${CARD_FIELDS} annualIncome fatherName motherName siblings partnerPreference gallery`)
    .lean();

  if (!member) throw ApiError.notFound('This biodata is not available');

  const [sent, received] = await Promise.all([
    Interest.findOne({ from: req.user._id, to: member._id }).lean(),
    Interest.findOne({ from: member._id, to: req.user._id }).lean(),
  ]);

  return success(res, {
    message: 'Biodata loaded',
    data: {
      ...member,
      id: member._id,
      interestSent: Boolean(sent),
      interestReceived: Boolean(received),
    },
  });
});

module.exports = { listMembers, listMatches, getMember };
