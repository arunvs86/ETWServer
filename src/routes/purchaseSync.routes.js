const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/purchaseSync.controller');

// Public generic sync (no auth): body { sessionId }
router.post('/purchase/sync', ctrl.sync);

module.exports = router;
