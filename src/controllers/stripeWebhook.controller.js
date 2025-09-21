const svc = require('../services/membership.service');

async function handle(req, res) {
  try {
    const sig = req.headers['stripe-signature'] || '';
    console.log('[WEBHOOK] hit. sig present:', !!sig);   // <--- add this
    const out = await svc.handleStripeWebhook({ rawBody: req.body, signature: sig });
    console.log('[WEBHOOK] handled:', out);
    res.json(out);
  } catch (err) {
    console.error('[WEBHOOK] error:', err.message);
    res.status(err.status || 400).json({ error: err.message });
  }
}

module.exports = { handle };
