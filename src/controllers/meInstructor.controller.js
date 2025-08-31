const svc = require('../services/meInstructor.service');

function getUserId(req) {
    return req.auth?.userId    
    || req.user?.id
    || req.user?._id
    || req.headers['x-user-id']
    || null;
}

// POST /me/instructor/apply
async function apply(req, res, next) {
  try {
    const userId = getUserId(req);
    const out = await svc.apply({ userId, payload: req.body || {} });
    return res.status(201).json(out);
  } catch (err) { next(err); }
}

// GET /me/instructor/application
async function getMyApplication(req, res, next) {
  try {
    const userId = getUserId(req);
    const out = await svc.getMyApplication({ userId });
    return res.json(out);
  } catch (err) { next(err); }
}

module.exports = { apply, getMyApplication };
