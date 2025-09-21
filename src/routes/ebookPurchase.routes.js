const router = require('express').Router();
const ctrl = require('../controllers/ebookPurchase.controller');
const { authGuard, requireRole } = require('../middlewares/auth');

// Instructor can ensure Stripe product/price when publishing
router.post('/instructor/ebooks/:ebookId/publish', authGuard, requireRole('instructor','admin'), ctrl.publish);

// Learner checkout
router.post('/me/ebooks/:ebookId/checkout', authGuard, ctrl.checkout);
router.post('/me/ebooks/confirm', authGuard, ctrl.confirm);

module.exports = router;
