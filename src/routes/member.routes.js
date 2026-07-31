const express = require('express');
const { listMembers, listMatches, getMember } = require('../controllers/member.controller');
const { protect } = require('../middlewares/auth.middleware');
const { requireAccess } = require('../middlewares/access.middleware');

const router = express.Router();

// Browsing biodatas requires a complete profile and — when PAYMENT_REQUIRED=true
// — a successful payment. That rule lives entirely in `requireAccess`.
router.use(protect, requireAccess);

router.get('/', listMembers);
router.get('/matches', listMatches);
router.get('/:id', getMember);

module.exports = router;
