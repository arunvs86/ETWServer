const express = require('express');
const router = express.Router();
const LiveSession = require('../models/LiveSession');
const LiveSessionAccess = require('../models/LiveSessionAccess');

// Replace with your real optional-auth middleware
function requireAuthOptional(req, _res, next) { next(); }

// Membership flag helper (adjust to your real shape if needed)
function isMemberActive(user) {
  const m = user?.membership;
  return !!m && (m.status === 'active' || m.status === 'trialing');
}

const JOIN_WINDOW_MIN = Number(process.env.LIVE_JOIN_WINDOW_MIN || 10);

/**
 * GET /live-sessions/:id/entitlement
 * Returns { canJoin: boolean, source?: 'free'|'membership'|'purchase', reason?: string }
 */
router.get('/live-sessions/:id/entitlement', requireAuthOptional, async (req, res) => {
  const s = await LiveSession.findById(req.params.id).lean();
  if (!s) return res.status(404).json({ error: 'Not found' });

  // Free
  if (s.pricing?.type === 'free') return res.json({ canJoin: true, source: 'free' });

  // Members free
  if (s.membersAccess === 'free' && isMemberActive(req.user)) {
    return res.json({ canJoin: true, source: 'membership' });
  }

  // Purchases require auth
  if (!req.user) return res.json({ canJoin: false, reason: 'auth_required' });

  const access = await LiveSessionAccess.findOne({
    userId: req.user._id,
    sessionId: s._id,
  }).lean();

  if (access) return res.json({ canJoin: true, source: access.source || 'purchase' });

  return res.json({ canJoin: false, reason: 'purchase_required' });
});

/**
 * POST /live-sessions/:id/join
 * Server-side entitlement + (optional) join window gating + returns a URL (dummy in Phase 1).
 */
router.post('/live-sessions/:id/join', requireAuthOptional, async (req, res) => {
  const s = await LiveSession.findById(req.params.id).lean();
  if (!s) return res.status(404).json({ ok: false, reason: 'not_found' });
  if (s.status === 'canceled') return res.status(400).json({ ok: false, reason: 'canceled' });

  // Entitlement checks
  let allowed = false;
  if (s.pricing?.type === 'free') allowed = true;
  else if (s.membersAccess === 'free' && isMemberActive(req.user)) allowed = true;
  else if (req.user) {
    const access = await LiveSessionAccess.findOne({ userId: req.user._id, sessionId: s._id }).lean();
    allowed = !!access;
  }
  if (!allowed) return res.status(403).json({ ok: false, reason: 'not_entitled' });

  // (Optional) Server-side join window gating
  const now = new Date();
  const start = new Date(s.startAt);
  const end = new Date(s.endAt);
  const openFrom = new Date(start.getTime() - JOIN_WINDOW_MIN * 60 * 1000);
  const joinOpen = now >= openFrom && now <= new Date(end.getTime() + 5 * 60 * 1000);
  if (!joinOpen) return res.status(409).json({ ok: false, reason: 'join_window_closed' });

  // Phase 1: dummy URL (or zoom.joinUrl if you have it)
  const url = s?.zoom?.joinUrl || s?.zoom?.startUrl || 'https://example.com/dummy-live';
  return res.json({ ok: true, url });
});

module.exports = router;
