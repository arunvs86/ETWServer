// controllers/liveSession.controller.js
const svc = require('../services/liveSession.service');

function getUserId(req) {
  return req.user?.id || req.user?._id || req.headers['x-user-id'] || null;
}

// POST /live-sessions
async function create(req, res, next) {
  try {
    const hostUserId = getUserId(req);
    const out = await svc.create({ hostUserId, payload: req.body || {} });
    return res.status(201).json(out);
  } catch (err) { next(err); }
}

// GET /live-sessions
async function list(req, res, next) {
  try {
    const { status, from, to, visibility, hostUserId, limit, page } = req.query;
    const out = await svc.list({ status, from, to, visibility, hostUserId, limit: Number(limit || 50), page: Number(page || 1) });
    return res.json(out);
  } catch (err) { next(err); }
}

// GET /live-sessions/:id
async function getOne(req, res, next) {
  try {
    const out = await svc.getById(req.params.id);
    return res.json(out);
  } catch (err) { next(err); }
}

// GET /live-sessions/:id/entitlement
async function entitlement(req, res, next) {
  try {
    const session = await svc.getById(req.params.id);
    // const userId = (req.user && (req.user.id || req.user._id)) || null;
    const userId = getUserId(req); // uses req.user or 'x-user-id' (dev)
    console.log("userId", userId)
    const out = await svc.entitlement({ session, userId });
    return res.json(out);
  } catch (err) { next(err); }
}

// GET /live-sessions/:id/join
async function join(req, res, next) {
  try {
    const userId = getUserId(req);
    const out = await svc.join({ sessionId: req.params.id, userId });
    if (!out.ok) return res.status(403).json(out);
    return res.json(out);
  } catch (err) { next(err); }
}

// POST /live-sessions/:id/purchase (DEV only shortcut)
async function devFakePurchase(req, res, next) {
  try {
    const userId = getUserId(req);
    const out = await svc.devFakePurchase({ sessionId: req.params.id, userId });
    return res.status(201).json(out);
  } catch (err) { next(err); }
}

module.exports = {
  create,
  list,
  getOne,
  entitlement,
  join,
  devFakePurchase,
};
