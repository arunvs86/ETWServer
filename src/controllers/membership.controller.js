// src/controllers/membership.controller.js
const svc = require('../services/membership.service');

function getUserId(req) {
  return req.user?.id || req.user?._id || req.headers['x-user-id'] || null;
}

// GET /memberships/plans
async function listPlans(req, res, next) {
  try {
    const out = await svc.listPlans();
    return res.json(out);
  } catch (err) { next(err); }
}

// POST /me/membership/checkout
async function checkout(req, res, next) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    const { planId } = req.body || {};
    const out = await svc.createCheckout({ userId, planId });
    return res.status(201).json(out);
  } catch (err) { next(err); }
}

// POST /me/membership/cancel
async function cancel(req, res, next) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    const out = await svc.cancelAtPeriodEnd({ userId });
    return res.json(out);
  } catch (err) { next(err); }
}

async function getMine(req, res, next) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    res.set('Cache-Control', 'no-store'); // avoid 304 while testing
    const out = await svc.getMyMembership({ userId });
    return res.json(out);
  } catch (err) { next(err); }
}

async function syncPublicFromCheckout(req, res, next) {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const membership = await svc.syncFromCheckoutSessionPublic({ sessionId });
    return res.json({ ok: true, membership });
  } catch (err) { next(err); }
}

module.exports = {
  listPlans,
  getMine,
  checkout,
  cancel,
  syncPublicFromCheckout, // ✅ export
};