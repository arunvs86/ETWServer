// const crypto = require('crypto');
// const LiveSession = require('../models/LiveSession');
// const LiveSessionAccess = require('../models/LiveSessionAccess');

// let Membership = null;
// let Order = null;
// try { Membership = require('../models/Membership'); } catch (_) {}
// try { Order = require('../models/Order'); } catch (_) {}

// const JOIN_WINDOW_MINUTES = parseInt(process.env.LIVE_JOIN_WINDOW_MIN || process.env.LIVE_JOIN_WINDOW_MINUTES || '10', 10);
// const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// function shortToken(len = 16) {
//   return crypto.randomBytes(len).toString('base64url');
// }
// function makeDummyJoinUrl(sessionId) {
//   const token = shortToken(12);
//   return `${FRONTEND_URL}/live/${sessionId}/join?d=${token}`;
// }

// async function isUserMember(userId) {
//   if (!Membership) return false;
//   const m = await Membership.findOne({ userId, status: 'active' }).lean();
//   return !!m;
// }

// async function hasPaidOrderForSession(userId, sessionId) {
//   if (!Order) return false;
//   const o = await Order.findOne({
//     userId,
//     'items.productType': 'liveSession',
//     'items.productRef': sessionId,
//     status: { $in: ['paid', 'succeeded', 'complete'] },
//   }).lean();
//   return !!o;
// }

// async function create({ hostUserId, payload }) {
//   const doc = new LiveSession({
//     hostUserId,
//     courseId: payload.courseId || undefined,
//     title: payload.title,
//     description: payload.description || '',
//     startAt: new Date(payload.startAt),
//     endAt: new Date(payload.endAt),
//     timezone: payload.timezone || 'Europe/London',
//     visibility: payload.visibility || 'public',
//     capacity: payload.capacity || 0,
//     provider: 'zoom',
//     pricing: {
//       type: payload.pricing?.type || 'free',
//       amountMinor: payload.pricing?.amountMinor || 0,
//       currency: payload.pricing?.currency || 'GBP',
//     },
//     membersAccess: payload.membersAccess || 'none',
//     dummyJoinUrl: undefined,
//     // ↓ NEW: accept zoom from payload (assumes route sanitizes; harmless if undefined)
//     zoom: payload.zoom ? {
//       joinUrl: payload.zoom.joinUrl,
//       passcode: payload.zoom.passcode,
//       startUrl: payload.zoom.startUrl,
//     } : undefined,
//   });

//   await doc.validate();
//   await doc.save();

//   doc.dummyJoinUrl = makeDummyJoinUrl(doc._id.toString());
//   await doc.save();

//   return doc.toObject();
// }


// async function list({ status, from, to, visibility, hostUserId, limit = 50, page = 1 }) {
//   const q = {};
//   if (status) q.status = status;
//   if (visibility) q.visibility = visibility;
//   if (hostUserId) q.hostUserId = hostUserId;
//   if (from || to) {
//     q.startAt = {};
//     if (from) q.startAt.$gte = new Date(from);
//     if (to) q.startAt.$lte = new Date(to);
//   }

//   const safeLimit = Math.min(limit, 200);
//   const skip = (Math.max(1, page) - 1) * safeLimit;
//   const results = await LiveSession.find(q).sort({ startAt: 1 }).skip(skip).limit(safeLimit).lean();
//   const total = await LiveSession.countDocuments(q);
//   return { total, results, page, pageSize: safeLimit };
// }

// async function getById(id) {
//   const doc = await LiveSession.findById(id).lean();
//   if (!doc) throw new Error('Live session not found');
//   return doc;
// }

// async function entitlement({ session, userId }) {
//   if (!userId) return { canJoin: false, reason: 'auth_required' };

//   if (session.pricing?.type === 'free') {
//     return { canJoin: true, source: 'free' };
//   }

//   const member = await isUserMember(userId);
//   if (member && session.membersAccess === 'free') {
//     return { canJoin: true, source: 'membership' };
//   }

//   // PRIMARY: access doc from webhook/confirm
//   const access = await LiveSessionAccess.findOne({ userId, sessionId: session._id }).lean();
//   if (access) return { canJoin: true, source: access.source || 'purchase' };

//   // Optional fallback: legacy orders
//   const paid = await hasPaidOrderForSession(userId, session._id);
//   if (paid) return { canJoin: true, source: 'purchase' };

//   if (member && session.membersAccess === 'paid') {
//     return { canJoin: false, reason: 'purchase_required_even_for_members' };
//   }
//   return { canJoin: false, reason: 'purchase_required' };
// }

// async function join({ sessionId, userId }) {
//   const session = await LiveSession.findById(sessionId);
//   if (!session) throw new Error('Live session not found');
//   if (session.status === 'canceled') throw new Error('Session canceled');

//   if (!session.isJoinableNow(new Date(), JOIN_WINDOW_MINUTES)) {
//     return { ok: false, reason: 'outside_join_window', joinWindowMinutes: JOIN_WINDOW_MINUTES };
//   }

//   const ent = await entitlement({ session: session.toObject(), userId });
//   if (!ent.canJoin) return { ok: false, reason: ent.reason };

//   return { ok: true, url: session.dummyJoinUrl || makeDummyJoinUrl(session._id.toString()) };
// }

// async function devFakePurchase({ sessionId, userId }) {
//   if (process.env.LIVESESSIONS_DEV_FAKE_PURCHASE !== 'true') {
//     const err = new Error('Fake purchase is disabled');
//     err.status = 400;
//     throw err;
//   }
//   const session = await LiveSession.findById(sessionId).lean();
//   if (!session) throw new Error('Live session not found');
//   if (session.pricing?.type !== 'paid') {
//     const err = new Error('Session is not paid');
//     err.status = 400;
//     throw err;
//   }
//   if (!Order) throw new Error('Order model not found; wire your real checkout instead');

//   const payload = {
//     userId,
//     amountMinor: session.pricing.amountMinor || 0,
//     currency: session.pricing.currency || 'GBP',
//     status: 'paid',
//     items: [
//       {
//         productType: 'liveSession',
//         productRef: session._id,
//         title: session.title,
//         unitAmountMinor: session.pricing.amountMinor || 0,
//         quantity: 1,
//       },
//     ],
//     meta: { source: 'dev_fake_purchase' },
//   };
//   const order = await Order.create(payload);
//   return { ok: true, orderId: order._id };
// }

// module.exports = {
//   create,
//   list,
//   getById,
//   entitlement,
//   join,
//   devFakePurchase,
// };

const crypto = require('crypto');
const LiveSession = require('../models/LiveSession');
const LiveSessionAccess = require('../models/LiveSessionAccess');

let Membership = null;
let Order = null;
try { Membership = require('../models/Membership'); } catch (_) {}
try { Order = require('../models/Order'); } catch (_) {}

const { v2: cloudinary } = require('cloudinary');
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const JOIN_WINDOW_MINUTES = parseInt(process.env.LIVE_JOIN_WINDOW_MIN || process.env.LIVE_JOIN_WINDOW_MINUTES || '10', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// --- helpers ---
function shortToken(len = 16) { return crypto.randomBytes(len).toString('base64url'); }
function makeDummyJoinUrl(sessionId) {
  const token = shortToken(12);
  return `${FRONTEND_URL}/live/${sessionId}/join?d=${token}`;
}
function isDataUrl(str='') { return typeof str === 'string' && /^data:.*;base64,/.test(str); }
function parseDataUrl(s='') {
  const m = s.match(/^data:(.+);base64,(.*)$/);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}
function cleanIdBase(s='session') {
  return (s || 'session').trim().replace(/\W+/g,'-').slice(0,50) + '-' + Date.now();
}
function uploadBufferToCloudinary(buffer, { folder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'live_thumbs', public_id } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id, resource_type: 'image' },
      (err, res) => err ? reject(err) : resolve(res)
    );
    stream.end(buffer);
  });
}

// --- keep the rest of your file unchanged ---

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

async function create({ hostUserId, payload }) {
  // 1) If thumbnail is a data URL, upload to Cloudinary and replace with URL
  let thumbnailUrl = payload.thumbnail || '';
  let thumbnailPublicId;

  if (thumbnailUrl && isDataUrl(thumbnailUrl)) {
    const parsed = parseDataUrl(thumbnailUrl);
    if (!parsed) {
      const err = new Error('Invalid thumbnail data URL');
      err.status = 400;
      throw err;
    }
    const uploaded = await uploadBufferToCloudinary(parsed.buffer, {
      public_id: cleanIdBase(payload.title || 'session'),
    });
    thumbnailUrl = uploaded.secure_url;
    thumbnailPublicId = uploaded.public_id;
  }

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
    // store the hosted thumbnail (string field) + optional publicId (if your schema has it)
    thumbnail: thumbnailUrl || undefined,
    thumbnailPublicId: thumbnailPublicId || undefined,

    dummyJoinUrl: undefined,
    zoom: payload.zoom ? {
      joinUrl: payload.zoom.joinUrl,
      passcode: payload.zoom.passcode,
      startUrl: payload.zoom.startUrl,
    } : undefined,
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

  const access = await LiveSessionAccess.findOne({ userId, sessionId: session._id }).lean();
  if (access) return { canJoin: true, source: access.source || 'purchase' };

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
    const err = new Error('Fake purchase is disabled');
    err.status = 400;
    throw err;
  }
  const session = await LiveSession.findById(sessionId).lean();
  if (!session) throw new Error('Live session not found');
  if (session.pricing?.type !== 'paid') {
    const err = new Error('Session is not paid');
    err.status = 400;
    throw err;
  }
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

module.exports = {
  create,
  list,
  getById,
  entitlement,
  join,
  devFakePurchase,
};
