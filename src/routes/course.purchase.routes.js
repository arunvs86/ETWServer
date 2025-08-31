const router = require('express').Router();
const ctrl = require('../controllers/coursePurchase.controller');
const { authGuard, requireRole } = require('../middlewares/auth');

// Instructor triggers Stripe setup when publishing/republishing
router.post('/instructor/courses/:courseId/publish', authGuard, requireRole('instructor','admin'), ctrl.publish);

// Learner checkout for a single course
router.post('/me/courses/:courseId/checkout', authGuard, ctrl.checkout);

module.exports = router;
