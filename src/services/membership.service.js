// // services/membership.service.js
// const Stripe = require('stripe');
// const { Types } = require('mongoose');
// const Membership = require('../models/Membership');
// const courseSale = require('./courseSale.service');
// const livePurchase = require('./livePurchase.service'); // <— ADD
// const resourcePurchase = require('./resourcePurchase.service'); // <— ADD

// const STRIPE_SK = process.env.STRIPE_SECRET_KEY;
// const STRIPE_WH = process.env.STRIPE_WEBHOOK_SECRET;
// const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
// const LIFETIME_PRICE_ID = process.env.LIFETIME_PRICE_ID;

// const stripe = STRIPE_SK ? new Stripe(STRIPE_SK, { apiVersion: '2024-06-20' }) : null;
// const FAR_FUTURE = new Date('2099-12-31T23:59:59.999Z');

// function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

// async function listPlans() {
//   return { plans: [{ id: 'lifetime', plan: 'lifetime', interval: 'lifetime', priceId: LIFETIME_PRICE_ID }] };
// }

// async function getMyMembership({ userId }) {
//   if (!Types.ObjectId.isValid(userId)) throw httpError(400, 'Invalid user');
//   const membership = await Membership.findOne({ userId }).lean();
//   return { membership };
// }

// async function createCheckout({ userId, planId }) {
//   if (!stripe) throw httpError(500, 'Stripe not configured');
//   if (!Types.ObjectId.isValid(userId)) throw httpError(400, 'Invalid user');
//   if (planId !== 'lifetime') throw httpError(400, 'Unknown plan');
//   if (!LIFETIME_PRICE_ID) throw httpError(500, 'Missing LIFETIME_PRICE_ID');

//   const session = await stripe.checkout.sessions.create({
//     mode: 'payment',
//     line_items: [{ price: LIFETIME_PRICE_ID, quantity: 1 }],
//     success_url: `${FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
//     cancel_url: `${FRONTEND_URL}/billing/cancel`,
//     metadata: { userId: String(userId), planId: 'lifetime' },
//     allow_promotion_codes: true,
//   });

//   return { checkoutUrl: session.url, sessionId: session.id, planId: 'lifetime' };
// }

// async function cancelAtPeriodEnd() { throw httpError(400, 'Lifetime plan cannot be cancelled'); }

// async function upsertLifetimeFromCheckout({ userId, session }) {
//   const createdAt = new Date(session.created * 1000);
//   const doc = await Membership.findOneAndUpdate(
//     { userId },
//     {
//       userId,
//       plan: 'lifetime',
//       status: 'active',
//       currentPeriodStart: createdAt,
//       currentPeriodEnd: FAR_FUTURE,
//       cancelAtPeriodEnd: false,
//       provider: 'stripe',
//       stripe: {
//         customerId: session.customer || undefined,
//         priceId: LIFETIME_PRICE_ID,
//         latestInvoiceId: undefined,
//       },
//     },
//     { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
//   );
//   return doc;
// }

// async function handleStripeWebhook({ rawBody, signature }) {
//   if (!stripe) throw httpError(500, 'Stripe not configured');

//   let event;
//   try {
//     if (!signature && process.env.NODE_ENV !== 'production') {
//       event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
//     } else {
//       event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WH);
//     }
//   } catch (err) {
//     throw httpError(400, `Webhook signature verification failed: ${err.message}`);
//   }

//   switch (event.type) {
//     case 'checkout.session.completed': {
//       const sess = event.data.object;

//       // Lifetime membership
//       if (sess.mode === 'payment' && sess.metadata?.planId === 'lifetime') {
//         const userId = sess.metadata.userId;
//         if (Types.ObjectId.isValid(userId)) await upsertLifetimeFromCheckout({ userId, session: sess });
//       }

//       // Course purchase
//       if (sess.mode === 'payment' && sess.metadata?.type === 'course') {
//         const userId = sess.metadata.userId;
//         const courseId = sess.metadata.courseId;
//         if (Types.ObjectId.isValid(userId) && Types.ObjectId.isValid(courseId)) {
//           try { await courseSale.grantCourseAfterPayment({ userId, courseId, session: sess }); }
//           catch (e) { console.error('[WEBHOOK] grant course failed:', e?.message || e); }
//         }
//       }

//       // Live session purchase  <<< THIS IS THE IMPORTANT PART
//       if (sess.mode === 'payment' && sess.metadata?.type === 'live-session') {
//         const userId = sess.metadata.userId;
//         const liveSessionId = sess.metadata.liveSessionId;
//         if (Types.ObjectId.isValid(userId) && Types.ObjectId.isValid(liveSessionId)) {
//           try { await livePurchase.grantLiveSessionAfterPayment({ userId, liveSessionId, session: sess }); }
//           catch (e) { console.error('[WEBHOOK] grant live-session failed:', e?.message || e); }
//         }
//       }

//            // Resource purchase  <<<<<< ADD THIS
//      if (sess.mode === 'payment' && sess.metadata?.type === 'resource') {
//           const userId = sess.metadata.userId;
//           const resourceId = sess.metadata.resourceId;
//           if (Types.ObjectId.isValid(userId) && Types.ObjectId.isValid(resourceId)) {
//             try { await resourcePurchase.grantResourceAfterPayment({ userId, resourceId, session: sess }); }
//             catch (e) { console.error('[WEBHOOK] grant resource failed:', e?.message || e); }
//           }
//         }

//       break;
//     }
//     default:
//       console.log('[WEBHOOK] ignored event:', event.type);
//   }

//   return { ok: true, type: event.type };
// }

// module.exports = {
//   listPlans,
//   getMyMembership,
//   createCheckout,
//   cancelAtPeriodEnd,
//   handleStripeWebhook,
//   upsertLifetimeFromCheckout
// };


// const Stripe = require('stripe');
// const { Types } = require('mongoose');
// const Membership = require('../models/Membership');
// const courseSale = require('./courseSale.service');
// const livePurchase = require('./livePurchase.service');
// const resourcePurchase = require('./resourcePurchase.service');

// const STRIPE_SK = process.env.STRIPE_SECRET_KEY;
// const STRIPE_WH = process.env.STRIPE_WEBHOOK_SECRET;
// const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
// const YEARLY_PRICE_ID = process.env.YEARLY_PRICE_ID;      // £75 one-time
// const LIFETIME_PRICE_ID = process.env.LIFETIME_PRICE_ID;  // £100 one-time

// const stripe = STRIPE_SK ? new Stripe(STRIPE_SK, { apiVersion: '2024-06-20' }) : null;
// const FAR_FUTURE = new Date('2099-12-31T23:59:59.999Z');

// function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

// // ---- utils
// function addMonths(date, months) {
//   const d = new Date(date);
//   const day = d.getDate();
//   d.setMonth(d.getMonth() + months);
//   // handle month overflow (e.g., Jan 31 + 1 month)
//   if (d.getDate() < day) d.setDate(0);
//   return d;
// }

// // ---------- Public Plans ----------
// async function listPlans() {
//   // Keep shape compatible with your frontend client (which probably unwraps .plans)
//   return {
//     plans: [
//       {
//         id: 'yearly',
//         title: '1 Year',
//         interval: '12-months',
//         priceId: YEARLY_PRICE_ID,
//         priceMinor: 7500,
//         currency: 'GBP',
//         badge: '12 months access',
//       },
//       {
//         id: 'lifetime',
//         title: 'Lifetime',
//         interval: 'one-time',
//         priceId: LIFETIME_PRICE_ID,
//         priceMinor: 10000,
//         currency: 'GBP',
//         badge: 'Pay once, own forever',
//       }
//     ]
//   };
// }

// async function getMyMembership({ userId }) {
//   if (!Types.ObjectId.isValid(userId)) throw httpError(400, 'Invalid user');
//   const membership = await Membership.findOne({ userId }).lean();
//   return { membership };
// }

// // ---------- Checkout (Option A: one-time for both) ----------
// async function createCheckout({ userId, planId }) {
//   if (!stripe) throw httpError(500, 'Stripe not configured');
//   if (!Types.ObjectId.isValid(userId)) throw httpError(400, 'Invalid user');
//   if (!['yearly', 'lifetime'].includes(planId)) throw httpError(400, 'Unknown plan');

//   const priceId = planId === 'yearly' ? YEARLY_PRICE_ID : LIFETIME_PRICE_ID;
//   if (!priceId) throw httpError(500, `Missing ${planId.toUpperCase()}_PRICE_ID`);

//   const session = await stripe.checkout.sessions.create({
//     mode: 'payment',
//     line_items: [{ price: priceId, quantity: 1 }],
//     success_url: `${FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
//     cancel_url: `${FRONTEND_URL}/billing/cancel`,
//     metadata: { userId: String(userId), planId },
//     allow_promotion_codes: true,
//   });

//   return { checkoutUrl: session.url, sessionId: session.id, planId };
// }

// async function cancelAtPeriodEnd() {
//   // Not applicable for Option A (no subscriptions)
//   throw httpError(400, 'One-time plans cannot be cancelled');
// }

// // ---------- Upserts after payment ----------
// async function upsertLifetimeFromCheckout({ userId, session }) {
//   const createdAt = new Date(session.created * 1000);
//   const doc = await Membership.findOneAndUpdate(
//     { userId },
//     {
//       userId,
//       plan: 'lifetime',
//       status: 'active',
//       currentPeriodStart: createdAt,
//       currentPeriodEnd: FAR_FUTURE,
//       cancelAtPeriodEnd: false,
//       provider: 'stripe',
//       stripe: {
//         customerId: session.customer || undefined,
//         priceId: LIFETIME_PRICE_ID,
//         latestInvoiceId: undefined,
//       },
//     },
//     { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
//   );
//   return doc;
// }

// async function upsertYearlyFromCheckout({ userId, session }) {
//   const createdAt = new Date(session.created * 1000);
//   const existing = await Membership.findOne({ userId });

//   const base = existing?.currentPeriodEnd && existing.currentPeriodEnd > createdAt
//     ? existing.currentPeriodEnd
//     : createdAt;

//   const newEnd = addMonths(base, 12);

//   const doc = await Membership.findOneAndUpdate(
//     { userId },
//     {
//       userId,
//       plan: 'yearly',
//       status: 'active',
//       currentPeriodStart: createdAt,
//       currentPeriodEnd: newEnd,
//       cancelAtPeriodEnd: false,
//       provider: 'stripe',
//       stripe: {
//         customerId: session.customer || undefined,
//         priceId: YEARLY_PRICE_ID,
//         latestInvoiceId: undefined,
//       },
//     },
//     { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
//   );
//   return doc;
// }

// // ---------- Webhook ----------
// async function handleStripeWebhook({ rawBody, signature }) {
//   if (!stripe) throw httpError(500, 'Stripe not configured');

//   let event;
//   try {
//     if (!signature && process.env.NODE_ENV !== 'production') {
//       event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
//     } else {
//       event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WH);
//     }
//   } catch (err) {
//     throw httpError(400, `Webhook signature verification failed: ${err.message}`);
//   }

//   switch (event.type) {
//     case 'checkout.session.completed': {
//       const sess = event.data.object;
//       const userId = sess.metadata?.userId;
//       const planId = sess.metadata?.planId;

//       if (Types.ObjectId.isValid(userId) && planId === 'lifetime') {
//         await upsertLifetimeFromCheckout({ userId, session: sess });
//       }
//       if (Types.ObjectId.isValid(userId) && planId === 'yearly') {
//         await upsertYearlyFromCheckout({ userId, session: sess });
//       }

//       // --- Course one-time payments
//       if (sess.mode === 'payment' && sess.metadata?.type === 'course') {
//         const courseId = sess.metadata.courseId;
//         if (Types.ObjectId.isValid(userId) && Types.ObjectId.isValid(courseId)) {
//           try { await courseSale.grantCourseAfterPayment({ userId, courseId, session: sess }); }
//           catch (e) { console.error('[WEBHOOK] grant course failed:', e?.message || e); }
//         }
//       }

//       // --- Live session
//       if (sess.mode === 'payment' && sess.metadata?.type === 'live-session') {
//         const liveSessionId = sess.metadata.liveSessionId;
//         if (Types.ObjectId.isValid(userId) && Types.ObjectId.isValid(liveSessionId)) {
//           try { await livePurchase.grantLiveSessionAfterPayment({ userId, liveSessionId, session: sess }); }
//           catch (e) { console.error('[WEBHOOK] grant live-session failed:', e?.message || e); }
//         }
//       }

//       // --- Resource
//       if (sess.mode === 'payment' && sess.metadata?.type === 'resource') {
//         const resourceId = sess.metadata.resourceId;
//         if (Types.ObjectId.isValid(userId) && Types.ObjectId.isValid(resourceId)) {
//           try { await resourcePurchase.grantResourceAfterPayment({ userId, resourceId, session: sess }); }
//           catch (e) { console.error('[WEBHOOK] grant resource failed:', e?.message || e); }
//         }
//       }
//       break;
//     }
//     default:
//       console.log('[WEBHOOK] ignored event:', event.type);
//   }

//   return { ok: true, type: event.type };
// }

// module.exports = {
//   listPlans,
//   getMyMembership,
//   createCheckout,
//   cancelAtPeriodEnd,
//   handleStripeWebhook,
//   upsertLifetimeFromCheckout
// };

const Stripe = require('stripe');
const { Types } = require('mongoose');
const Membership = require('../models/Membership');
const courseSale = require('./courseSale.service');
const livePurchase = require('./livePurchase.service');
const resourcePurchase = require('./resourcePurchase.service');

const STRIPE_SK = process.env.STRIPE_SECRET_KEY;
const STRIPE_WH = process.env.STRIPE_WEBHOOK_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const YEARLY_PRICE_ID = process.env.YEARLY_PRICE_ID;      // £75 one-time
const LIFETIME_PRICE_ID = process.env.LIFETIME_PRICE_ID;  // £100 one-time

const stripe = STRIPE_SK ? new Stripe(STRIPE_SK, { apiVersion: '2024-06-20' }) : null;
const FAR_FUTURE = new Date('2099-12-31T23:59:59.999Z');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

// ---------- Public Plans ----------
async function listPlans() {
  return {
    plans: [
      { id: 'yearly', title: '1 Year', interval: '12-months', priceId: YEARLY_PRICE_ID, priceMinor: 7500, currency: 'GBP', badge: '12 months access' },
      { id: 'lifetime', title: 'Lifetime', interval: 'one-time', priceId: LIFETIME_PRICE_ID, priceMinor: 10000, currency: 'GBP', badge: 'Pay once, own forever' }
    ]
  };
}

async function getMyMembership({ userId }) {
  if (!Types.ObjectId.isValid(userId)) throw httpError(400, 'Invalid user');
  const membership = await Membership.findOne({ userId }).lean();
  return { membership };
}

// ---------- Checkout (Option A: one-time for both) ----------
async function createCheckout({ userId, planId }) {
  if (!stripe) throw httpError(500, 'Stripe not configured');
  if (!Types.ObjectId.isValid(userId)) throw httpError(400, 'Invalid user');
  if (!['yearly', 'lifetime'].includes(planId)) throw httpError(400, 'Unknown plan');

  const priceId = planId === 'yearly' ? YEARLY_PRICE_ID : LIFETIME_PRICE_ID;
  if (!priceId) throw httpError(500, `Missing ${planId.toUpperCase()}_PRICE_ID`);

  console.log('[CREATE CHECKOUT]', { userId, planId });
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${FRONTEND_URL}/billing/cancel`,
    metadata: { userId: String(userId), planId },
    allow_promotion_codes: true,
  });
  console.log('[CHECKOUT CREATED]', session.id, session.url);

  return { checkoutUrl: session.url, sessionId: session.id, planId };
}

async function cancelAtPeriodEnd() {
  throw httpError(400, 'One-time plans cannot be cancelled');
}

// ---------- Upserts after payment ----------
async function upsertLifetimeFromCheckout({ userId, session }) {
  const createdAt = new Date(session.created * 1000);
  const doc = await Membership.findOneAndUpdate(
    { userId },
    {
      userId,
      plan: 'lifetime',
      status: 'active',
      currentPeriodStart: createdAt,
      currentPeriodEnd: FAR_FUTURE,
      cancelAtPeriodEnd: false,
      provider: 'stripe',
      stripe: {
        customerId: session.customer || undefined,
        priceId: LIFETIME_PRICE_ID,
        latestInvoiceId: undefined,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
  console.log('[UPSERT RESULT] lifetime', doc && doc._id);
  return doc;
}

async function upsertYearlyFromCheckout({ userId, session }) {
  const createdAt = new Date(session.created * 1000);
  const existing = await Membership.findOne({ userId });

  const base = existing?.currentPeriodEnd && existing.currentPeriodEnd > createdAt
    ? existing.currentPeriodEnd
    : createdAt;

  const newEnd = addMonths(base, 12);

  const doc = await Membership.findOneAndUpdate(
    { userId },
    {
      userId,
      plan: 'yearly',
      status: 'active',
      currentPeriodStart: createdAt,
      currentPeriodEnd: newEnd,
      cancelAtPeriodEnd: false,
      provider: 'stripe',
      stripe: {
        customerId: session.customer || undefined,
        priceId: YEARLY_PRICE_ID,
        latestInvoiceId: undefined,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
  console.log('[UPSERT RESULT] yearly', doc && doc._id);
  return doc;
}

// ---------- Webhook ----------
async function handleStripeWebhook({ rawBody, signature }) {
  if (!stripe) throw httpError(500, 'Stripe not configured');

  let event;
  try {
    if (!signature && process.env.NODE_ENV !== 'production') {
      const text =
        Buffer.isBuffer(rawBody) ? rawBody.toString('utf8')
        : typeof rawBody === 'string' ? rawBody
        : JSON.stringify(rawBody);
      event = JSON.parse(text);
    } else {
      event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WH);
    }
  } catch (err) {
    throw httpError(400, `Webhook signature verification failed: ${err.message}`);
  }

  console.log('[WEBHOOK EVENT]', event.type);

  switch (event.type) {
    case 'checkout.session.completed': {
      const sess = event.data.object;
      console.log('[WEBHOOK SESSION]', { id: sess.id, mode: sess.mode, paid: sess.payment_status, meta: sess.metadata });

      const userId = sess.metadata?.userId;
      const planId = sess.metadata?.planId;

      if (Types.ObjectId.isValid(userId) && planId === 'lifetime') {
        await upsertLifetimeFromCheckout({ userId, session: sess });
        console.log('[UPSERT] lifetime ok', userId);
      }
      if (Types.ObjectId.isValid(userId) && planId === 'yearly') {
        await upsertYearlyFromCheckout({ userId, session: sess });
        console.log('[UPSERT] yearly ok', userId);
      }

      // Optional: your other one-time purchases
      if (sess.mode === 'payment' && sess.metadata?.type === 'course') {
        const courseId = sess.metadata.courseId;
        if (Types.ObjectId.isValid(userId) && Types.ObjectId.isValid(courseId)) {
          try { await courseSale.grantCourseAfterPayment({ userId, courseId, session: sess }); }
          catch (e) { console.error('[WEBHOOK] grant course failed:', e?.message || e); }
        }
      }
      if (sess.mode === 'payment' && sess.metadata?.type === 'live-session') {
        const liveSessionId = sess.metadata.liveSessionId;
        if (Types.ObjectId.isValid(userId) && Types.ObjectId.isValid(liveSessionId)) {
          try { await livePurchase.grantLiveSessionAfterPayment({ userId, liveSessionId, session: sess }); }
          catch (e) { console.error('[WEBHOOK] grant live-session failed:', e?.message || e); }
        }
      }
      if (sess.mode === 'payment' && sess.metadata?.type === 'resource') {
        const resourceId = sess.metadata.resourceId;
        if (Types.ObjectId.isValid(userId) && Types.ObjectId.isValid(resourceId)) {
          try { await resourcePurchase.grantResourceAfterPayment({ userId, resourceId, session: sess }); }
          catch (e) { console.error('[WEBHOOK] grant resource failed:', e?.message || e); }
        }
      }
      if (sess.mode === 'payment' && sess.metadata?.type === 'quiz') {
        const quizId = sess.metadata.quizId;
        if (Types.ObjectId.isValid(userId) && Types.ObjectId.isValid(quizId)) {
          const quizSale = require('./quizSale.service');
          try { await quizSale.grantQuizAfterPayment({ userId, quizId, session: sess }); }
          catch (e) { console.error('[WEBHOOK] grant quiz failed:', e?.message || e); }
        }
      }
      break;
    }
    default:
      console.log('[WEBHOOK] ignored event:', event.type);
  }

  return { ok: true, type: event.type };
}

async function syncFromCheckoutSessionPublic({ sessionId }) {
  if (!stripe) throw httpError(500, 'Stripe not configured');

  // Fetch the Checkout Session from Stripe
  const sess = await stripe.checkout.sessions.retrieve(sessionId);

  if (!sess) throw httpError(404, 'Session not found');
  if (sess.payment_status !== 'paid') {
    throw httpError(400, `Session not paid: ${sess.payment_status}`);
  }

  const userId = sess.metadata?.userId;
  const planId = sess.metadata?.planId;

  if (!Types.ObjectId.isValid(userId)) throw httpError(400, 'Invalid user in session metadata');

  if (planId === 'lifetime') {
    const doc = await upsertLifetimeFromCheckout({ userId, session: sess });
    console.log('[SYNC PUBLIC] lifetime ok', userId, sess.id);
    return doc;
  }

  if (planId === 'yearly') {
    const doc = await upsertYearlyFromCheckout({ userId, session: sess });
    console.log('[SYNC PUBLIC] yearly ok', userId, sess.id);
    return doc;
  }

  throw httpError(400, 'Unknown plan in session');
}

module.exports = {
  listPlans,
  getMyMembership,
  createCheckout,
  cancelAtPeriodEnd,
  handleStripeWebhook,
  upsertLifetimeFromCheckout,
  upsertYearlyFromCheckout,
  syncFromCheckoutSessionPublic, // ✅ export
};