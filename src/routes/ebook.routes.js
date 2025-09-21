const express = require('express');
const router = express.Router();
const { attachUserIfPresent } = require('../middlewares/auth');
const ctrl = require('../controllers/ebook.controller');

// Public list
router.get('/', ctrl.listEbooks);

// Public single — items are gated; user context optional
router.get('/:slug', attachUserIfPresent, ctrl.getEbookBySlug);

module.exports = router;
