// controllers/mePurchases.controller.js
const svc = require('../services/purchases.service');

// function getUserId(req) {
//   return req.user?.id || req.user?._id || req.headers['x-user-id'] || null;
// }

function getUserId(req) {
    const id = req.user?.id || req.user?._id || req.headers['x-user-id'] || null;
    console.log('[me/purchases] userId=', String(id || 'null'));
    return id;
  }

function parseKinds(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  return String(raw)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

// Core handler (optionally forced kinds)
async function listItems(req, res, next, forced = null) {
    try {
      const userId = getUserId(req);
      const kinds = forced?.kinds || parseKinds(req.query.kinds);
      const q = String(req.query.q || '').trim() || null;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
      const debug = req.query.debug === '1';
  
      const out = await svc.listMyPurchases({ userId, kinds, q, page, limit, debug });
      res.json(out);
    } catch (e) { next(e); }
  }

// Alias used by GET /me/purchases (no forced kinds)
async function list(req, res, next) {
  return listItems(req, res, next, null);
}

module.exports = { list, listItems };
