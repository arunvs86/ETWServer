const Stripe = require('stripe');
const { Types } = require('mongoose');
const Ebook = require('../models/Ebook');
const Membership = require('../models/Membership');
const EbookAccess = require('../models/EbookAccess');
const Order = require('../models/Order');
const User = require('../models/User');
const { sendEbookEmail } = require('./notifyPurchase'); // add this function similar to sendResourceEmail

const STRIPE_SK = process.env.STRIPE_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const stripe = STRIPE_SK ? new Stripe(STRIPE_SK, { apiVersion: '2024-06-20' }) : null;

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const toStripeCurrency = (c) => String(c || 'GBP').toLowerCase();

function isMemberActive(mem) {
  if (!mem) return false;
  const now = new Date();
  return (mem.status === 'active' || mem.status === 'trialing') && now >= mem.currentPeriodStart && now < mem.currentPeriodEnd;
}

async function ensureStripeForEbook(ebookId) {
  if (!stripe) throw httpError(500, 'Stripe not configured');

  const r = await Ebook.findById(ebookId);
  if (!r) throw httpError(404, 'Ebook not found');

  if ((r.pricing?.amountMinor ?? 0) === 0) return r; // free => no stripe

  if (!r.stripe) r.stripe = {};
  if (!r.stripe.productId) {
    const product = await stripe.products.create({
      name: r.title,
      metadata: { ebookId: String(r._id), slug: r.slug || '' },
    });
    r.stripe.productId = product.id;
  }

  const price = await stripe.prices.create({
    currency: toStripeCurrency(r.pricing.currency || 'GBP'),
    unit_amount: r.pricing.amountMinor || 0,
    product: r.stripe.productId,
    metadata: { ebookId: String(r._id), slug: r.slug || '' },
  });

  r.stripe.priceId = price.id;
  await r.save();
  return r;
}

async function createEbookCheckout({ userId, ebookId }) {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(ebookId)) {
    throw httpError(400, 'Invalid ids');
  }

  const r = await Ebook.findById(ebookId);
  if (!r) throw httpError(404, 'Ebook not found');

  if ((r.pricing?.amountMinor ?? 0) === 0) throw httpError(400, 'Ebook is free');

  const mem = await Membership.findOne({ userId });
  if (isMemberActive(mem) && r.pricing?.includedInMembership) {
    throw httpError(400, 'Membership already unlocks this ebook');
  }

  if (!stripe) throw httpError(500, 'Stripe not configured');

  const ensured = await ensureStripeForEbook(ebookId);

  const successUrl = `${FRONTEND_URL}/ebooks/${r.slug || r._id}?purchase=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${FRONTEND_URL}/ebooks/${r.slug || r._id}?purchase=cancel`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: ensured.stripe.priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      type: 'ebook',
      userId: String(userId),
      ebookId: String(ebookId),
    },
  });

  return { checkoutUrl: session.url, sessionId: session.id };
}

async function grantEbookAfterPayment({ userId, ebookId, session }) {
  const r = await Ebook.findById(ebookId).lean();
  if (!r) return { grantedNew: false };

  const amountMinor = session.amount_total ?? session.amount_subtotal ?? (r.pricing?.amountMinor || 0);
  const currency = (session.currency || (r.pricing?.currency || 'GBP')).toUpperCase();

  const idempotencyKey = String(session.payment_intent || session.id);
  const pre = await Order.findOne({ idempotencyKey }).select('_id').lean();

  // 1) Upsert Order
  const order = await Order.findOneAndUpdate(
    { idempotencyKey },
    {
      userId,
      items: [{
        kind: 'ebook',
        refId: r._id,
        titleSnapshot: r.title,
        amountMinor,
        currency,
        metadata: { slug: r.slug },
      }],
      totalAmountMinor: amountMinor,
      currency,
      status: 'paid',
      paymentProvider: 'stripe',
      stripe: {
        checkoutSessionId: session.id,
        paymentIntentId: session.payment_intent || undefined,
        customerId: session.customer || undefined,
      },
      idempotencyKey,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // 2) Grant access (idempotent)
  const resAccess = await EbookAccess.updateOne(
    { userId, ebookId },
    {
      $setOnInsert: {
        userId, ebookId,
        via: 'purchase',
        status: 'active',
        activatedAt: new Date(),
        expiresAt: null,
      },
    },
    { upsert: true }
  );

  const accessNew = !!(resAccess && (resAccess.upsertedCount > 0 || resAccess.upsertedId));
  const grantedNew = !pre || accessNew;

  // 3) Email once on first grant
  if (!pre) {
    try {
      const user = await User.findById(userId).select('name email').lean();
      await sendEbookEmail({
        user,
        ebook: { _id: r._id, slug: r.slug, title: r.title },
        amountMinor,
        currency,
      });
    } catch (e) {
      console.error('[EMAIL] ebook send failed:', e?.message || e);
    }
  }

  return { grantedNew, order };
}

module.exports = { ensureStripeForEbook, createEbookCheckout, grantEbookAfterPayment };
