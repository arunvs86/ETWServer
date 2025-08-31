// src/routes/resourcePurchase.routes.js
const router = require('express').Router();
const ctrl = require('../controllers/resourcePurchase.controller');
const { authGuard, requireRole } = require('../middlewares/auth');

// Instructor can trigger ensureStripe when publishing/republishing
router.post('/instructor/resources/:resourceId/publish', authGuard, requireRole('instructor','admin'), ctrl.publish);

// Learner checkout
router.post('/me/resources/:resourceId/checkout', authGuard, ctrl.checkout);
router.post('/me/resources/confirm', authGuard, ctrl.confirm);


module.exports = router;
