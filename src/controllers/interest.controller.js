const Interest = require('../models/Interest');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { sendInterestEmail } = require('../services/email.service');

const PROFILE_FIELDS = 'name age city district state photo occupation religion';

/** How many notifications the navbar bell shows at once. */
const NOTIFICATION_LIMIT = 10;

/** POST /api/interests/:memberId — send a like / interest. */
const sendInterest = asyncHandler(async (req, res) => {
  const { memberId } = req.params;

  if (String(memberId) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot send an interest to yourself');
  }

  const target = await User.findOne({ _id: memberId, isProfileComplete: true }).select('_id name email');
  if (!target) throw ApiError.notFound('This member is not available');

  const existing = await Interest.findOne({ from: req.user._id, to: memberId });
  if (existing) {
    return success(res, { message: 'You have already shown interest in this member', data: existing.toJSON() });
  }

  const interest = await Interest.create({
    from: req.user._id,
    to: memberId,
    type: req.body.type === 'like' ? 'like' : 'interested',
    message: (req.body.message || '').trim(),
  });

  // Fire-and-forget: a bounced notification must never fail the request. The
  // in-app bell is the source of truth, the email is only a nudge.
  sendInterestEmail({
    to: target.email,
    name: target.name,
    senderName: req.user.name,
    senderId: String(req.user._id),
  }).catch((error) => console.error('Interest notification email failed:', error.message));

  return created(res, interest.toJSON(), `Your interest has been sent to ${target.name}`);
});

/** DELETE /api/interests/:memberId — withdraw an interest. */
const withdrawInterest = asyncHandler(async (req, res) => {
  const removed = await Interest.findOneAndDelete({ from: req.user._id, to: req.params.memberId });
  if (!removed) throw ApiError.notFound('No interest found for this member');
  return success(res, { message: 'Interest withdrawn' });
});

/** GET /api/interests/received — notifications for the signed-in member. */
const receivedInterests = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);

  const filter = { to: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    Interest.find(filter)
      .populate('from', PROFILE_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Interest.countDocuments(filter),
  ]);

  // Opening the list clears the unread badge.
  await Interest.updateMany({ to: req.user._id, isRead: false }, { $set: { isRead: true } });

  return paginated(res, { items, page, limit, total, message: 'Interests loaded' });
});

/** GET /api/interests/sent */
const sentInterests = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);

  const [items, total] = await Promise.all([
    Interest.find({ from: req.user._id })
      .populate('to', PROFILE_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Interest.countDocuments({ from: req.user._id }),
  ]);

  return paginated(res, { items, page, limit, total, message: 'Sent interests loaded' });
});

/** PATCH /api/interests/:id/respond — accept or decline a received interest. */
const respondToInterest = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['accepted', 'declined'].includes(status)) {
    throw ApiError.badRequest('Status must be accepted or declined');
  }

  const interest = await Interest.findOneAndUpdate(
    { _id: req.params.id, to: req.user._id },
    { $set: { status } },
    { new: true }
  ).populate('from', PROFILE_FIELDS);

  if (!interest) throw ApiError.notFound('Interest not found');

  return success(res, { message: `Interest ${status}`, data: interest.toJSON() });
});

/**
 * GET /api/interests/notifications
 * The navbar bell: the newest interests received, newest first.
 *
 * Unlike /received this deliberately does NOT mark anything read — opening a
 * dropdown is not the same as reading it. The client calls
 * PATCH /notifications/read when the member acts on that.
 */
const notifications = asyncHandler(async (req, res) => {
  const [items, unread] = await Promise.all([
    Interest.find({ to: req.user._id })
      .populate('from', PROFILE_FIELDS)
      .sort({ createdAt: -1 })
      .limit(NOTIFICATION_LIMIT)
      .lean(),
    Interest.countDocuments({ to: req.user._id, isRead: false }),
  ]);

  // `from` is the member who liked this user — the client links straight to
  // their full biodata, which the browse gate still guards on the server.
  const data = items
    .filter((item) => item.from)
    .map((item) => ({
      id: String(item._id),
      memberId: String(item.from._id),
      name: item.from.name,
      photo: item.from.photo,
      age: item.from.age,
      city: item.from.city,
      occupation: item.from.occupation,
      type: item.type,
      status: item.status,
      isRead: item.isRead,
      createdAt: item.createdAt,
    }));

  return success(res, { message: 'Notifications loaded', data: { items: data, unread } });
});

/** PATCH /api/interests/notifications/read — clears the bell badge. */
const markNotificationsRead = asyncHandler(async (req, res) => {
  await Interest.updateMany({ to: req.user._id, isRead: false }, { $set: { isRead: true } });
  return success(res, { message: 'Notifications marked as read', data: { unread: 0 } });
});

/** GET /api/interests/count — unread badge + dashboard counters. */
const interestCounts = asyncHandler(async (req, res) => {
  const [unread, received, sent, accepted] = await Promise.all([
    Interest.countDocuments({ to: req.user._id, isRead: false }),
    Interest.countDocuments({ to: req.user._id }),
    Interest.countDocuments({ from: req.user._id }),
    Interest.countDocuments({ from: req.user._id, status: 'accepted' }),
  ]);

  return success(res, { data: { unread, received, sent, accepted } });
});

module.exports = {
  sendInterest,
  withdrawInterest,
  receivedInterests,
  sentInterests,
  respondToInterest,
  interestCounts,
  notifications,
  markNotificationsRead,
};
