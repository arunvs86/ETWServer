const express = require('express');
const router = express.Router();

// ✅ Correct import path for your auth helpers
const { attachUserIfPresent } = require('../middlewares/auth');

// ✅ Resource controller (exports listResources + getResourceBySlug)
const ctrl = require('../controllers/resource.controller');

// Public list
router.get('/', ctrl.listResources);

// Public single — items are gated; user context is optional
router.get('/:slug', attachUserIfPresent, ctrl.getResourceBySlug);

module.exports = router;
