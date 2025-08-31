const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/coursePurchase.controller');

// Public: confirm course purchase and grant enrollment
router.post('/courses/purchase/sync', ctrl.syncFromCheckoutPublic);

module.exports = router;
