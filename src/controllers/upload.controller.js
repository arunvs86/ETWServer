// src/controllers/upload.controller.js
const svc = require('../services/upload.service');

function getUserId(req) {
  return req.user?.id || req.user?._id || req.headers['x-user-id'] || null;
}

// POST /uploads/sign
async function sign(req, res, next) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Auth required' });

    const out = await svc.signUpload({ userId, payload: req.body || {} });
    return res.json(out);
  } catch (err) {
    next(err);
  }
}

module.exports = { sign };
