const svc = require('../services/adminInstructor.service');

function getAdminId(req) {
  return req.user?.id || req.user?._id || req.headers['x-user-id'] || null;
}

async function list(req, res, next) {
  try {
    const out = await svc.listApplications({
      status: req.query.status,
      q: req.query.q,
      page: req.query.page,
      limit: req.query.limit
    });
    return res.json(out);
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const out = await svc.getApplicationById({ id: req.params.id });
    return res.json(out);
  } catch (err) { next(err); }
}

async function approve(req, res, next) {
  try {
    const out = await svc.approve({ adminId: getAdminId(req), id: req.params.id });
    return res.json(out);
  } catch (err) { next(err); }
}

async function reject(req, res, next) {
  try {
    const reason = req.body?.reason || '';
    const out = await svc.reject({ adminId: getAdminId(req), id: req.params.id, reason });
    return res.json(out);
  } catch (err) { next(err); }
}

async function updateNotes(req, res, next) {
  try {
    const notes = req.body?.notes || '';
    const out = await svc.updateNotes({ id: req.params.id, notes });
    return res.json(out);
  } catch (err) { next(err); }
}

module.exports = { list, getOne, approve, reject, updateNotes };
