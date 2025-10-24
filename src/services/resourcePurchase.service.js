// src/services/resourcePurchase.service.js
const Stripe = require('stripe');
const { Types } = require('mongoose');
const Resource = require('../models/Resource');
const Membership = require('../models/Membership');
const ResourceAccess = require('../models/ResourceAccess'); // from earlier reply
const Order = require('../models/Order'); // you already have this in courses flow
const User = require('../models/User');                    
const { sendResourceEmail } = require('./notifyPurchase'); 


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

/** Ensure Stripe product/price on the resource for the current price */
async function ensureStripeForResource(resourceId) {
  if (!stripe) throw httpError(500, 'Stripe not configured');

  const r = await Resource.findById(resourceId);
  if (!r) throw httpError(404, 'Resource not found');

  // free resources don't need stripe
  if ((r.pricing?.amountMinor ?? 0) === 0) return r;

  // keep a similar shape to Course.stripe
  if (!r.stripe) r.stripe = {};
  if (!r.stripe.productId) {
    const product = await stripe.products.create({
      name: r.title,
      metadata: { resourceId: String(r._id), slug: r.slug || '' },
    });
    r.stripe.productId = product.id;
  }

  const price = await stripe.prices.create({
    currency: toStripeCurrency(r.pricing.currency || 'GBP'),
    unit_amount: r.pricing.amountMinor || 0,
    product: r.stripe.productId,
    metadata: { resourceId: String(r._id), slug: r.slug || '' },
  });

  r.stripe.priceId = price.id;
  await r.save();
  return r;
}

/** Create a one-time Checkout session for a resource */
async function createResourceCheckout({ userId, resourceId }) {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(resourceId)) {
    throw httpError(400, 'Invalid ids');
  }

  const r = await Resource.findById(resourceId);
  if (!r) throw httpError(404, 'Resource not found');

  if ((r.pricing?.amountMinor ?? 0) === 0) throw httpError(400, 'Resource is free');

  // membership already unlocks it?
  const mem = await Membership.findOne({ userId });
  if (isMemberActive(mem) && r.pricing?.includedInMembership) {
    throw httpError(400, 'Membership already unlocks this resource');
  }

  if (!stripe) throw httpError(500, 'Stripe not configured');

  const ensured = await ensureStripeForResource(resourceId);

  // inside createResourceCheckout(...)
const successUrl = `${FRONTEND_URL}/resources/${r.slug || r._id}?purchase=success&session_id={CHECKOUT_SESSION_ID}`;
const cancelUrl  = `${FRONTEND_URL}/resources/${r.slug || r._id}?purchase=cancel`;


  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: ensured.stripe.priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      type: 'resource',
      userId: String(userId),
      resourceId: String(resourceId),
    },
  });

  return { checkoutUrl: session.url, sessionId: session.id };
}

/** On webhook success, mark Order and grant ResourceAccess, then email once */
async function grantResourceAfterPayment({ userId, resourceId, session }) {
  const r = await Resource.findById(resourceId).lean();
  if (!r) return { grantedNew: false };

  const amountMinor = session.amount_total ?? session.amount_subtotal ?? (r.pricing?.amountMinor || 0);
  const currency = (session.currency || (r.pricing?.currency || 'GBP')).toUpperCase();

  // Use Stripe payment intent (or session id) as idempotency key
  const idempotencyKey = String(session.payment_intent || session.id);

  // If we've already processed this payment, don't re-email
  const pre = await Order.findOne({ idempotencyKey }).select('_id').lean();

  // 1) Upsert Order (idempotent)
  const order = await Order.findOneAndUpdate(
    { idempotencyKey },
    {
      userId,
      items: [{
        kind: 'resource',
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
  const resAccess = await ResourceAccess.updateOne(
    { userId, resourceId },
    {
      $setOnInsert: {
        userId, resourceId,
        via: 'purchase',
        status: 'active',
        activatedAt: new Date(),
        expiresAt: null,
      },
    },
    { upsert: true }
  );

  const accessNew = !!(resAccess && (resAccess.upsertedCount > 0 || resAccess.upsertedId));
  const grantedNew = !pre || accessNew; // first time we saw this payment OR first-time access

  // 3) Email once on first grant
  if (!pre) {
    try {
      const user = await User.findById(userId).select('name email').lean();
      await sendResourceEmail({
        user,
        resource: { _id: r._id, slug: r.slug, title: r.title },
        amountMinor,
        currency,
      });
    } catch (e) {
      console.error('[EMAIL] resource send failed:', e?.message || e);
    }
  }

  return { grantedNew, order };
}

module.exports = { ensureStripeForResource, createResourceCheckout, grantResourceAfterPayment };
