const express = require('express');
const router = express.Router();
const stripeCtrl = require('../controllers/stripeWebhook.controller');

// Do NOT add body parsers here; app-level already provided express.raw
router.post('/', stripeCtrl.handle);

module.exports = router;
