const express = require('express');
const Stripe = require('stripe');
const LiveSession = require('../models/LiveSession');
const LiveSessionAccess = require('../models/LiveSessionAccess');

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' }) : null;

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:5173';

function requireAuth(req, res, next) { if (!req.user) return res.status(401).json({ error: 'Unauthorized' }); next(); }
function getUserId(req) { const v = req.user && (req.user._id || req.user.id); return v ? String(v) : null; }

/* CHECKOUT (unchanged) */
router.post('/me/live-sessions/:id/checkout', requireAuth, async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
    const user = req.user;
    const id = req.params.id;

    const s = await LiveSession.findById(id).lean();
    if (!s) return res.status(404).json({ error: 'Live session not found' });
    if (s.pricing?.type !== 'paid') return res.status(400).json({ error: 'This session is free — no checkout required' });
    if (!s.pricing?.amountMinor || s.pricing.amountMinor <= 0) return res.status(400).json({ error: 'Invalid price on session' });

    const currency = String(s.pricing.currency || 'GBP').toLowerCase();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      allow_promotion_codes: true,
      customer: user?.stripe?.customerId || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: Number(s.pricing.amountMinor),
          product_data: {
            name: s.title || 'Live Session',
            description: `Live session on ${new Date(s.startAt).toLocaleString()} (${s.timezone || 'Europe/London'})`,
          },
        },
      }],
      metadata: {
        type: 'live-session',
        liveSessionId: String(s._id),
        userId: String(getUserId({ user }) || ''), // token user id
      },
      success_url: `${FRONTEND_URL}/billing/live/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/billing/live/cancel`,
    });

    return res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    console.error('checkout error', err);
    return res.status(500).json({ error: 'Unable to create checkout session' });
  }
});

/* CONFIRM — upsert LiveSessionAccess after successful payment */
router.post('/me/live-sessions/:id/confirm', requireAuth, async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ ok: false, error: 'Stripe not configured' });

    const userId = getUserId(req);
    const liveId = req.params.id;
    const { sessionId } = req.body || {};

    if (!userId) return res.status(401).json({ ok: false, error: 'Not authenticated' });
    if (!sessionId) return res.status(400).json({ ok: false, error: 'Missing sessionId' });

    const s = await LiveSession.findById(liveId).select('_id title').lean();
    if (!s) return res.status(404).json({ ok: false, error: 'Live session not found' });

    const sess = await stripe.checkout.sessions.retrieve(sessionId);
    const metaOk =
      sess?.metadata?.type === 'live-session' &&
      String(sess?.metadata?.liveSessionId) === String(s._id) &&
      String(sess?.metadata?.userId) === String(userId);
    const paid = (sess?.payment_status === 'paid') || (sess?.status === 'complete');

    if (!metaOk) return res.status(400).json({ ok: false, error: 'Session metadata mismatch' });
    if (!paid)   return res.status(409).json({ ok: false, error: 'Payment not completed yet' });

    const r = await LiveSessionAccess.updateOne(
      { userId, sessionId: s._id },
      {
        $setOnInsert: { userId, sessionId: s._id, source: 'purchase' },
        $set: { orderId: sess.payment_intent || sess.id, notes: 'stripe_checkout_confirm' }
      },
      { upsert: true }
    );

    // tiny log to confirm behavior during dev
    if (process.env.NODE_ENV !== 'production') {
      console.log('[live confirm] upsert result', {
        matched: r.matchedCount, modified: r.modifiedCount, upserted: r.upsertedId
      });
    }

    return res.json({ ok: true, granted: true, source: 'purchase' });
  } catch (err) {
    console.error('live confirm error', err);
    return res.status(500).json({ ok: false, error: 'Confirm failed' });
  }
});

module.exports = router;
