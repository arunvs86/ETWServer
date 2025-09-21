// const Stripe = require('stripe');
// const { ensureStripeForEbook, createEbookCheckout, grantEbookAfterPayment } =
//   require('../services/ebookPurchase.service');

// const STRIPE_SK = process.env.STRIPE_SECRET_KEY;
// const stripe = STRIPE_SK ? new Stripe(STRIPE_SK, { apiVersion: '2024-06-20' }) : null;

// function getUserId(req) { return req.user?.id || req.user?._id || req.headers['x-user-id'] || null; }

// async function publish(req, res, next) {
//   try {
//     const { ebookId } = req.params;
//     const r = await ensureStripeForEbook(ebookId);
//     return res.json({ ok: true, ebookId: r._id, stripe: r.stripe });
//   } catch (e) { next(e); }
// }

// async function checkout(req, res, next) {
//   try {
//     const userId = getUserId(req);
//     if (!userId) return res.status(401).json({ error: 'Auth required' });
//     const { ebookId } = req.params;
//     const out = await createEbookCheckout({ userId, ebookId });
//     return res.json(out);
//   } catch (e) { next(e); }
// }

// async function confirm(req, res, next) {
//   try {
//     const userId = getUserId(req);
//     if (!userId) return res.status(401).json({ error: 'Auth required' });
//     if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

//     const { sessionId } = req.body || {};
//     if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

//     const session = await stripe.checkout.sessions.retrieve(sessionId);
//     if (!session) return res.status(404).json({ error: 'Session not found' });
//     if (session.payment_status !== 'paid') return res.status(400).json({ error: 'Payment not completed' });

//     const meta = session.metadata || {};
//     if (meta.type !== 'ebook') return res.status(400).json({ error: 'Wrong session type' });
//     if (String(userId) !== String(meta.userId)) return res.status(403).json({ error: 'User mismatch' });

//     await grantEbookAfterPayment({ userId: meta.userId, ebookId: meta.ebookId, session });
//     return res.json({ unlocked: true });
//   } catch (e) { next(e); }
// }

// module.exports = { publish, checkout, confirm };


// controllers/ebookPurchase.controller.js (or wherever this lives)
const Stripe = require('stripe');
const { ensureStripeForEbook, createEbookCheckout, grantEbookAfterPayment } =
  require('../services/ebookPurchase.service');
const Ebook = require('../models/Ebook');   // ← add this

const STRIPE_SK = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SK ? new Stripe(STRIPE_SK, { apiVersion: '2024-06-20' }) : null;

function getUserId(req) { return req.user?.id || req.user?._id || req.headers['x-user-id'] || null; }

async function publish(req, res, next) {
  try {
    const { ebookId } = req.params;

    // 1) ensure Stripe product/price as before
    const r = await ensureStripeForEbook(ebookId);

    // 2) flip status to published (idempotent)
    await Ebook.updateOne(
      { _id: ebookId },
      {
        $set: {
          status: 'published',
          publishedAt: new Date(),
          'stripe.productId': r?.stripe?.productId || r?.productId || undefined,
          'stripe.priceId': r?.stripe?.priceId || r?.priceId || undefined,
        },
      }
    );

    // 3) read back minimal fields to confirm
    const doc = await Ebook.findById(ebookId).select('status publishedAt stripe').lean();

    return res.json({
      ok: true,
      ebookId: String(ebookId),
      status: doc?.status,
      publishedAt: doc?.publishedAt,
      stripe: doc?.stripe,
    });
  } catch (e) { next(e); }
}

async function checkout(req, res, next) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    const { ebookId } = req.params;
    const out = await createEbookCheckout({ userId, ebookId });
    return res.json(out);
  } catch (e) { next(e); }
}

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
    if (meta.type !== 'ebook') return res.status(400).json({ error: 'Wrong session type' });
    if (String(userId) !== String(meta.userId)) return res.status(403).json({ error: 'User mismatch' });

    await grantEbookAfterPayment({ userId: meta.userId, ebookId: meta.ebookId, session });
    return res.json({ unlocked: true });
  } catch (e) { next(e); }
}

module.exports = { publish, checkout, confirm };
