// src/routes/payments.routes.js
const router = require('express').Router();
const { syncFromCheckoutSession } = require('../services/purchaseSync.service');

router.post('/stripe/checkout/confirm', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ message: 'sessionId required' });
    const out = await syncFromCheckoutSession({ sessionId });
    res.json(out);
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
});

module.exports = router;
