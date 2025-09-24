const express = require('express');
const crypto = require('crypto');
const { Types } = require('mongoose');
const LiveSession = require('../models/LiveSession');
const LiveSessionAccess = require('../models/LiveSessionAccess');
const { authGuard, requireRole } = require('../middlewares/auth');
const cloudinary = require('../lib/cloudinary');
const { uploadBufferToCloudinary } = require('../services/cloudinaryUpload.service');

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:5173';
const JOIN_WINDOW_MIN = Number(process.env.LIVE_JOIN_WINDOW_MIN || process.env.LIVE_JOIN_WINDOW_MINUTES || 10);

/* helpers */
function nocache(_req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
}

function sanitizeZoomInput(input = {}) {
  const out = {};
  const url = (input.joinUrl || '').trim();
  const pass = (input.passcode || '').trim();
  const startUrl = (input.startUrl || '').trim();

  const isHttps = (u) => /^https:\/\//i.test(u);
  const allowedHost = (u) => {
    try {
      const h = new URL(u).host.toLowerCase();
      return (
        h === 'zoom.us' ||
        h.endsWith('.zoom.us') ||        // *.zoom.us incl. vanity subdomains
        h === 'app.zoom.us'
      );
    } catch { return false; }
  };

  if (url && isHttps(url) && allowedHost(url)) out.joinUrl = url;
  if (startUrl && isHttps(startUrl) && allowedHost(startUrl)) out.startUrl = startUrl;
  if (pass) out.passcode = pass.slice(0, 64); // reasonable cap
  return Object.keys(out).length ? out : undefined;
}


function getUserId(req) {
    const v = req.user && (req.user._id || req.user.id);
    if (v) return String(v);
    const shim = req.headers['x-user-id'];
    return shim ? String(shim) : null;
  }

function isMemberActive(user) {
  const m = user?.membership;
  return !!m && (m.status === 'active' || m.status === 'trialing');
}
function shortToken(len = 12) { return crypto.randomBytes(len).toString('base64url'); }
function makeDummyJoinUrl(sessionId) { return `${FRONTEND_URL}/live/${sessionId}/join?d=${shortToken()}`; }
function mapPublic(s) {
  return {
    id: String(s._id),
    hostUserId: String(s.hostUserId),
    title: s.title,
    description: s.description || '',
    thumbnail: s.thumbnail,
    startAt: s.startAt,
    endAt: s.endAt,
    timezone: s.timezone || 'Europe/London',
    status: s.status,
    visibility: s.visibility,
    pricing: s.pricing ? {
      type: s.pricing.type || 'free',
      amountMinor: Number(s.pricing.amountMinor || 0),
      currency: s.pricing.currency || 'GBP',
    } : { type: 'free', amountMinor: 0, currency: 'GBP' },
    membersAccess: s.membersAccess || 'none',
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/* CREATE (instructor/admin only) */
// router.post('/', authGuard, requireRole('instructor', 'admin'), async (req, res) => {
//   try {
//     const uid = getUserId(req);
//     if (!uid) return res.status(401).json({ error: 'Unauthorized (no user id)' });
//     if (!Types.ObjectId.isValid(uid)) return res.status(400).json({ error: 'Invalid user id' });
//     console.log("req.body", req.body)
//     const {
//       title, description = '', startAt, endAt, timezone = 'Europe/London',
//       visibility = 'public', capacity = 0, pricing = { type: 'free' },
//       membersAccess = 'none', thumbnail,
//     } = req.body || {};

//     if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });
//     if (!startAt || !endAt) return res.status(400).json({ error: 'Start and End are required' });

//     const start = new Date(startAt);
//     const end = new Date(endAt);
//     const now = new Date();
//     if (isNaN(+start) || isNaN(+end)) return res.status(400).json({ error: 'Invalid dates' });
//     if (start <= now) return res.status(400).json({ error: 'Start must be in the future' });
//     if (end <= start) return res.status(400).json({ error: 'End must be after Start' });
//     if (pricing?.type === 'paid' && !(Number(pricing.amountMinor || 0) > 0)) {
//       return res.status(400).json({ error: 'Invalid price' });
//     }

//     const zoom = sanitizeZoomInput(req.body?.zoom || {});
//     console.log("zoom link", zoom)
//     const doc = await LiveSession.create({
//       hostUserId: uid,
//       title: String(title).trim(),
//       description,
//       thumbnail: thumbnail || undefined,
//       startAt: start,
//       endAt: end,
//       timezone,
//       visibility,
//       capacity,
//       provider: 'zoom',
//       pricing: {
//         type: pricing?.type || 'free',
//         amountMinor: pricing?.type === 'paid' ? Number(pricing.amountMinor || 0) : 0,
//         currency: pricing?.currency || 'GBP',
//       },
//       membersAccess,
//       dummyJoinUrl: undefined,
//       ...(zoom ? { zoom } : {}),
//     });

//     if (!doc.dummyJoinUrl) { doc.dummyJoinUrl = makeDummyJoinUrl(doc._id.toString()); await doc.save(); }
//     return res.status(201).json(mapPublic(doc.toObject()));
//   } catch (err) {
//     console.error('CREATE /live-sessions error:', err?.message, err?.errors || '');
//     if (err?.name === 'ValidationError') return res.status(400).json({ error: 'Validation failed', details: err.errors });
//     return res.status(500).json({ error: 'Failed to create live session' });
//   }
// });

router.post('/', authGuard, requireRole('instructor', 'admin'), async (req, res) => {
  try {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized (no user id)' });
    if (!Types.ObjectId.isValid(uid)) return res.status(400).json({ error: 'Invalid user id' });

    const {
      title, description = '', startAt, endAt, timezone = 'Europe/London',
      visibility = 'public', capacity = 0, pricing = { type: 'free' },
      membersAccess = 'none', thumbnail,
    } = req.body || {};

    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });
    if (!startAt || !endAt) return res.status(400).json({ error: 'Start and End are required' });

    // ⬇️ Upload to Cloudinary if thumbnail is a base64 data URI
    let thumbnailUrl;
if (thumbnail && thumbnail.startsWith('data:image/')) {
  try {
    // Strip "data:image/jpeg;base64," prefix
    const base64Data = thumbnail.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    const uploaded = await uploadBufferToCloudinary(buffer, {
      folder: 'live-thumbnails',
    });

    console.log("Cloudinary upload ok:", uploaded.secure_url);
    thumbnailUrl = uploaded.secure_url;
  } catch (err) {
    console.error("Cloudinary upload failed:", err);
    return res.status(500).json({ error: 'Thumbnail upload failed' });
  }
} else if (thumbnail && /^https?:\/\//.test(thumbnail)) {
  thumbnailUrl = thumbnail; // accept normal URL
}

    const doc = await LiveSession.create({
      hostUserId: uid,
      title: String(title).trim(),
      description,
      thumbnail: thumbnailUrl,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      timezone,
      visibility,
      capacity,
      provider: 'zoom',
      pricing: {
        type: pricing?.type || 'free',
        amountMinor: pricing?.type === 'paid' ? Number(pricing.amountMinor || 0) : 0,
        currency: pricing?.currency || 'GBP',
      },
      membersAccess,
      dummyJoinUrl: undefined,
      ...(sanitizeZoomInput(req.body?.zoom) ? { zoom: sanitizeZoomInput(req.body?.zoom) } : {}),
    });

    if (!doc.dummyJoinUrl) { doc.dummyJoinUrl = makeDummyJoinUrl(doc._id.toString()); await doc.save(); }
    return res.status(201).json(mapPublic(doc.toObject()));
  } catch (err) {
    console.error('CREATE /live-sessions error:', err?.message);
    if (err?.name === 'ValidationError') return res.status(400).json({ error: 'Validation failed', details: err.errors });
    return res.status(500).json({ error: 'Failed to create live session' });
  }
});

/* LIST */
router.get('/', async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '12', 10)));
  const q = {};
  if (req.query.status) q.status = req.query.status;
  if (req.query.visibility) q.visibility = req.query.visibility;
  const [results, total] = await Promise.all([
    LiveSession.find(q).sort({ startAt: 1 }).skip((page-1)*limit).limit(limit).lean(),
    LiveSession.countDocuments(q),
  ]);
  res.json({ results: results.map(mapPublic), total, page, pageSize: limit });
});

/* DETAIL */
router.get('/:id', async (req, res) => {
  const s = await LiveSession.findById(req.params.id).lean();
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(mapPublic(s));
});

/* ENTITLEMENT (optional-auth already attached at mount) */
router.get('/:id/entitlement', authGuard, nocache, async (req, res) => {
  const s = await LiveSession.findById(req.params.id).lean();
  if (!s) return res.status(404).json({ error: 'Not found' });

  // free to all
  if (s.pricing?.type === 'free') return res.json({ canJoin: true, source: 'free' });
  // free to members
  if (s.membersAccess === 'free' && isMemberActive(req.user)) {
    return res.json({ canJoin: true, source: 'membership' });
  }

  // need user to check purchases/access
  const userId = getUserId(req);
  console.log("Userid", userId)
  if (!userId) return res.json({ canJoin: false, reason: 'auth_required' });

  // check live access first (granted by webhook/confirm)
  const access = await LiveSessionAccess.findOne({ userId, sessionId: s._id }).lean();
  if (access) return res.json({ canJoin: true, source: access.source || 'purchase' });

  // no grant
  return res.json({ canJoin: false, reason: 'purchase_required' });
});

/* JOIN (GET and POST behave the same) */
async function joinHandler(req, res) {
  const s = await LiveSession.findById(req.params.id).lean();
  if (!s) return res.status(404).json({ ok: false, reason: 'not_found' });
  if (s.status === 'canceled') return res.status(400).json({ ok: false, reason: 'canceled' });

  // entitlement
  let allowed = false;
  if (s.pricing?.type === 'free') allowed = true;
  else if (s.membersAccess === 'free' && isMemberActive(req.user)) allowed = true;
  else {
    const userId = getUserId(req);
    if (userId) {
      const access = await LiveSessionAccess.findOne({ userId, sessionId: s._id }).lean();
      allowed = !!access;
    }
  }
  if (!allowed) return res.status(403).json({ ok: false, reason: 'not_entitled' });

  // join window
  const now = new Date();
  const start = new Date(s.startAt);
  const end = new Date(s.endAt);
  const openFrom = new Date(start.getTime() - JOIN_WINDOW_MIN * 60 * 1000);
  const joinOpen = now >= openFrom && now <= new Date(end.getTime() + 5 * 60 * 1000);
  if (!joinOpen) return res.status(409).json({ ok: false, reason: 'join_window_closed' });

  // dummy or provider url
  const url = s?.zoom?.joinUrl || s?.zoom?.startUrl || s?.dummyJoinUrl || 'https://example.com/dummy-live';
  return res.json({ ok: true, url });
}

// add below other helpers



router.get('/:id/join', authGuard,nocache, joinHandler);
router.post('/:id/join', authGuard,nocache, joinHandler);

// UPDATE (instructor/admin; host ownership enforced)
router.patch('/:id', authGuard, requireRole('instructor', 'admin'), async (req, res) => {
  try {
    const uid = getUserId(req);
    const s = await LiveSession.findById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });

    // Only owner instructor or admin can edit
    const isOwner = String(s.hostUserId) === String(uid);
    const isAdmin = req.user?.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const updates = {};
    if (typeof req.body.title === 'string') updates.title = req.body.title.trim();
    if (typeof req.body.description === 'string') updates.description = req.body.description;
    if (typeof req.body.thumbnail === 'string') updates.thumbnail = req.body.thumbnail || undefined;

    if (req.body.startAt) updates.startAt = new Date(req.body.startAt);
    if (req.body.endAt)   updates.endAt   = new Date(req.body.endAt);

    if (req.body.timezone)   updates.timezone   = req.body.timezone;
    if (req.body.visibility) updates.visibility = req.body.visibility;
    if (typeof req.body.capacity === 'number') updates.capacity = req.body.capacity;

    if (req.body.pricing) {
      const p = req.body.pricing;
      updates.pricing = {
        type: p.type || s.pricing?.type || 'free',
        amountMinor: Number(p.amountMinor || 0),
        currency: p.currency || s.pricing?.currency || 'GBP',
      };
    }

    if (req.body.membersAccess) updates.membersAccess = req.body.membersAccess;

    // NEW: zoom input
    if (req.body.zoom) {
      const z = sanitizeZoomInput(req.body.zoom);
      if (z) updates.zoom = z;
      else updates.zoom = undefined; // allows clearing when invalid/empty
    }

    Object.assign(s, updates);
    await s.validate();
    await s.save();

    return res.json(mapPublic(s.toObject()));
  } catch (err) {
    console.error('PATCH /live-sessions/:id error:', err?.message);
    return res.status(400).json({ error: err.message || 'Update failed' });
  }
});


module.exports = router;
