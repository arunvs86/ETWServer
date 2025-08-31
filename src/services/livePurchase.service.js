// // services/livePurchase.service.js
// const { Types } = require('mongoose');
// const LiveSessionAccess = require('../models/LiveSessionAccess');
// const LiveSession = require('../models/LiveSession');

// async function grantLiveSessionAfterPayment({ userId, liveSessionId, session }) {
//   if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(liveSessionId)) return false;

//   const exists = await LiveSession.findById(liveSessionId).select('_id').lean();
//   if (!exists) return false;

//   await LiveSessionAccess.updateOne(
//     { userId, sessionId: liveSessionId },
//     {
//       $setOnInsert: { userId, sessionId: liveSessionId, source: 'purchase' },
//       $set: { orderId: session?.payment_intent || session?.id },
//     },
//     { upsert: true }
//   );
//   return true;
// }

// module.exports = { grantLiveSessionAfterPayment };

// src/services/livePurchase.service.js
const Stripe = require('stripe');
const crypto = require('crypto');
const { Types } = require('mongoose');

const LiveSession = require('../models/LiveSession');
const LiveSessionAccess = require('../models/LiveSessionAccess');

let Membership = null;
let Order = null;
try { Membership = require('../models/Membership'); } catch (_) {}
try { Order = require('../models/Order'); } catch (_) {}

const STRIPE_SK = process.env.STRIPE_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const stripe = STRIPE_SK ? new Stripe(STRIPE_SK, { apiVersion: '2024-06-20' }) : null;

const JOIN_WINDOW_MINUTES = parseInt(process.env.LIVE_JOIN_WINDOW_MIN || process.env.LIVE_JOIN_WINDOW_MINUTES || '10', 10);

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

/* ---------------- Utils ---------------- */
function shortToken(len = 12) { return crypto.randomBytes(len).toString('base64url'); }
function makeDummyJoinUrl(sessionId) { return `${FRONTEND_URL}/live/${sessionId}/join?d=${shortToken(12)}`; }

async function isUserMember(userId) {
  if (!Membership) return false;
  const m = await Membership.findOne({ userId, status: 'active' }).lean();
  return !!m;
}

async function hasPaidOrderForSession(userId, sessionId) {
  if (!Order) return false;
  const o = await Order.findOne({
    userId,
    'items.productType': 'liveSession',
    'items.productRef': sessionId,
    status: { $in: ['paid', 'succeeded', 'complete'] },
  }).lean();
  return !!o;
}

/* ---------------- CRUD-ish live session API you already had ---------------- */
async function create({ hostUserId, payload }) {
  const doc = new LiveSession({
    hostUserId,
    courseId: payload.courseId || undefined,
    title: payload.title,
    description: payload.description || '',
    startAt: new Date(payload.startAt),
    endAt: new Date(payload.endAt),
    timezone: payload.timezone || 'Europe/London',
    visibility: payload.visibility || 'public',
    capacity: payload.capacity || 0,
    provider: 'zoom',
    pricing: {
      type: payload.pricing?.type || 'free',
      amountMinor: payload.pricing?.amountMinor || 0,
      currency: payload.pricing?.currency || 'GBP',
    },
    membersAccess: payload.membersAccess || 'none',
    dummyJoinUrl: undefined,
  });

  await doc.validate();
  await doc.save();

  doc.dummyJoinUrl = makeDummyJoinUrl(doc._id.toString());
  await doc.save();

  return doc.toObject();
}

async function list({ status, from, to, visibility, hostUserId, limit = 50, page = 1 }) {
  const q = {};
  if (status) q.status = status;
  if (visibility) q.visibility = visibility;
  if (hostUserId) q.hostUserId = hostUserId;
  if (from || to) {
    q.startAt = {};
    if (from) q.startAt.$gte = new Date(from);
    if (to) q.startAt.$lte = new Date(to);
  }

  const safeLimit = Math.min(limit, 200);
  const skip = (Math.max(1, page) - 1) * safeLimit;
  const results = await LiveSession.find(q).sort({ startAt: 1 }).skip(skip).limit(safeLimit).lean();
  const total = await LiveSession.countDocuments(q);
  return { total, results, page, pageSize: safeLimit };
}

async function getById(id) {
  const doc = await LiveSession.findById(id).lean();
  if (!doc) throw new Error('Live session not found');
  return doc;
}

async function entitlement({ session, userId }) {
  if (!userId) return { canJoin: false, reason: 'auth_required' };

  if (session.pricing?.type === 'free') {
    return { canJoin: true, source: 'free' };
  }

  const member = await isUserMember(userId);
  if (member && session.membersAccess === 'free') {
    return { canJoin: true, source: 'membership' };
  }

  // PRIMARY: access doc from webhook/confirm
  const access = await LiveSessionAccess.findOne({ userId, sessionId: session._id }).lean();
  if (access) return { canJoin: true, source: access.source || 'purchase' };

  // Optional fallback: legacy orders
  const paid = await hasPaidOrderForSession(userId, session._id);
  if (paid) return { canJoin: true, source: 'purchase' };

  if (member && session.membersAccess === 'paid') {
    return { canJoin: false, reason: 'purchase_required_even_for_members' };
  }
  return { canJoin: false, reason: 'purchase_required' };
}

async function join({ sessionId, userId }) {
  const session = await LiveSession.findById(sessionId);
  if (!session) throw new Error('Live session not found');
  if (session.status === 'canceled') throw new Error('Session canceled');

  if (!session.isJoinableNow(new Date(), JOIN_WINDOW_MINUTES)) {
    return { ok: false, reason: 'outside_join_window', joinWindowMinutes: JOIN_WINDOW_MINUTES };
  }

  const ent = await entitlement({ session: session.toObject(), userId });
  if (!ent.canJoin) return { ok: false, reason: ent.reason };

  return { ok: true, url: session.dummyJoinUrl || makeDummyJoinUrl(session._id.toString()) };
}

async function devFakePurchase({ sessionId, userId }) {
  if (process.env.LIVESESSIONS_DEV_FAKE_PURCHASE !== 'true') {
    const err = new Error('Fake purchase is disabled'); err.status = 400; throw err;
  }
  const session = await LiveSession.findById(sessionId).lean();
  if (!session) throw new Error('Live session not found');
  if (session.pricing?.type !== 'paid') { const err = new Error('Session is not paid'); err.status = 400; throw err; }
  if (!Order) throw new Error('Order model not found; wire your real checkout instead');

  const payload = {
    userId,
    amountMinor: session.pricing.amountMinor || 0,
    currency: session.pricing.currency || 'GBP',
    status: 'paid',
    items: [
      {
        productType: 'liveSession',
        productRef: session._id,
        title: session.title,
        unitAmountMinor: session.pricing.amountMinor || 0,
        quantity: 1,
      },
    ],
    meta: { source: 'dev_fake_purchase' },
  };
  const order = await Order.create(payload);
  return { ok: true, orderId: order._id };
}

/* ---------------- Stripe checkout for PAID live sessions ---------------- */
async function createLiveCheckout({ userId, liveSessionId }) {
  if (!stripe) throw httpError(500, 'Stripe not configured');
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(liveSessionId)) {
    throw httpError(400, 'Invalid ids');
  }

  const live = await LiveSession.findById(liveSessionId);
  if (!live) throw httpError(404, 'Live session not found');

  // require a configured Price on the live session
  const priceId = live?.stripe?.priceId;
  if (!priceId) throw httpError(500, 'Live session price not configured');

  const success_url = `${FRONTEND_URL}/live/${liveSessionId}?purchase=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancel_url  = `${FRONTEND_URL}/live/${liveSessionId}?purchase=cancel`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url,
    cancel_url,
    metadata: {
      type: 'live-session',
      userId: String(userId),
      liveSessionId: String(liveSessionId),
    },
  });

  return { checkoutUrl: session.url, sessionId: session.id };
}

/* ---------------- Grant after payment (webhook or success sync) ---------------- */
async function grantLiveSessionAfterPayment({ userId, liveSessionId, session }) {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(liveSessionId)) return false;

  const exists = await LiveSession.findById(liveSessionId).select('_id').lean();
  if (!exists) return false;

  await LiveSessionAccess.updateOne(
    { userId, sessionId: liveSessionId },
    {
      $setOnInsert: { userId, sessionId: liveSessionId, source: 'purchase' },
      $set: { orderId: session?.payment_intent || session?.id },
    },
    { upsert: true }
  );
  return true;
}

/* ---------------- Exports (single block) ---------------- */
module.exports = {
  // CRUD-ish
  create,
  list,
  getById,
  entitlement,
  join,
  devFakePurchase,
  // Stripe purchase
  createLiveCheckout,
  grantLiveSessionAfterPayment,
};
