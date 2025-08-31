// src/controllers/enrollment.controller.js
const svc = require('../services/enrollment.service');

function getUserId(req) {
  return req.user?.id || req.user?._id || req.headers['x-user-id'] || null;
}

// POST /enrollments
async function create(req, res, next) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    const out = await svc.createEnrollment({ userId, payload: req.body || {} });
    return res.status(201).json(out);
  } catch (err) { next(err); }
}

// GET /me/enrollments
async function listMine(req, res, next) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    const { page, limit } = req.query || {};
    const out = await svc.listMyEnrollments({ userId, page, limit });
    return res.json(out);
  } catch (err) { next(err); }
}

module.exports = { create, listMine };
