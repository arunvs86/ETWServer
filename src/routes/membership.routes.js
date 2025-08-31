// // src/routes/membership.routes.js
// const express = require('express');
// const router = express.Router();
// const ctrl = require('../controllers/membership.controller');

// // Public
// router.get('/memberships/plans', ctrl.listPlans);

// const { authGuard, requireRole } = require('../middlewares/auth');
// router.use(authGuard);

// // User
// router.get('/me/membership', ctrl.getMine);
// router.post('/me/membership/checkout', ctrl.checkout);
// router.post('/me/membership/cancel', ctrl.cancel);

// module.exports = router;


const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/membership.controller');

// Public
router.get('/memberships/plans', ctrl.listPlans);

// ✅ Public success sync (no auth) — uses sessionId to lookup & upsert
router.post('/membership/sync', ctrl.syncPublicFromCheckout);

const { authGuard } = require('../middlewares/auth');
router.use(authGuard);

// Authed
router.get('/me/membership', ctrl.getMine);
router.post('/me/membership/checkout', ctrl.checkout);
router.post('/me/membership/cancel', ctrl.cancel);

module.exports = router;
