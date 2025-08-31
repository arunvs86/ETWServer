// src/controllers/resourcePurchase.controller.js
const Stripe = require('stripe');
const { createResourceCheckout, ensureStripeForResource, grantResourceAfterPayment } =
  require('../services/resourcePurchase.service');

const STRIPE_SK = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SK ? new Stripe(STRIPE_SK, { apiVersion: '2024-06-20' }) : null;

function getUserId(req) { return req.user?.id || req.user?._id || req.headers['x-user-id'] || null; }

/** Instructor publish hook (optional) – pre-create product/price */
async function publish(req, res, next) {
  try {
    const { resourceId } = req.params;
    const r = await ensureStripeForResource(resourceId);
    return res.json({ ok: true, resourceId: r._id, stripe: r.stripe });
  } catch (e) { next(e); }
}

/** Learner checkout for a single resource */
async function checkout(req, res, next) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    const { resourceId } = req.params;
    const out = await createResourceCheckout({ userId, resourceId });
    return res.json(out);
  } catch (e) { next(e); }
}

/** Confirm after redirect (safety net when webhooks are flaky locally) */
async function confirm(req, res, next) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.payment_status !== 'paid') return res.status(400).json({ error: 'Payment not completed' });

    const meta = session.metadata || {};
    if (meta.type !== 'resource') return res.status(400).json({ error: 'Wrong session type' });

    // (Optional) sanity check user
    if (String(userId) !== String(meta.userId)) {
      // You may allow admins; generally this should match the buyer.
      return res.status(403).json({ error: 'User mismatch' });
    }

    await grantResourceAfterPayment({
      userId: meta.userId,
      resourceId: meta.resourceId,
      session,
    });

    return res.json({ unlocked: true });
  } catch (e) { next(e); }
}

module.exports = { publish, checkout, confirm };
