const svc = require('../services/purchaseSync.service');

async function sync(req, res) {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const out = await svc.syncFromCheckoutSession({ sessionId });
    return res.json({ ok: true, ...out });
  } catch (err) {
    console.error('[PURCHASE SYNC] error:', err.message);
    res.status(err.status || 400).json({ error: err.message });
  }
}

module.exports = { sync };
