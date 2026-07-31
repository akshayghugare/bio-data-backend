const express = require('express');
const {
  sendInterest,
  withdrawInterest,
  receivedInterests,
  sentInterests,
  respondToInterest,
  interestCounts,
  notifications,
  markNotificationsRead,
} = require('../controllers/interest.controller');
const { protect } = require('../middlewares/auth.middleware');
const { requireAccess } = require('../middlewares/access.middleware');

const router = express.Router();

router.use(protect);

// The unread badge is visible everywhere, so it is not behind the browse gate.
router.get('/count', interestCounts);

// Everything else needs the same access as browsing biodatas.
router.use(requireAccess);

// Declared before the '/:id' routes so the literal paths always win.
router.get('/notifications', notifications);
router.patch('/notifications/read', markNotificationsRead);

router.get('/received', receivedInterests);
router.get('/sent', sentInterests);
router.post('/:memberId', sendInterest);
router.delete('/:memberId', withdrawInterest);
router.patch('/:id/respond', respondToInterest);

module.exports = router;
