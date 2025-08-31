// src/controllers/instructorQuiz.controller.js
const svc = require('../services/instructorQuiz.service');

function getInstructorId(req) {
  return req.user?.id || req.user?._id || req.headers['x-user-id'] || null;
}
function getIsAdmin(req) {
  const role = req.user?.role || req.headers['x-user-role'];
  return String(role).toLowerCase() === 'admin';
}

// POST /instructor/quizzes
async function create(req, res, next) {
  try {
    const out = await svc.createQuiz({
      instructorId: getInstructorId(req),
      isAdmin: getIsAdmin(req),
      payload: req.body || {},
    });
    return res.status(201).json(out);
  } catch (err) { next(err); }
}

// PATCH /instructor/quizzes/:id
async function updateBasics(req, res, next) {
  try {
    const out = await svc.updateQuizBasics({
      instructorId: getInstructorId(req),
      isAdmin: getIsAdmin(req),
      quizId: req.params.id,
      payload: req.body || {},
    });
    return res.json(out);
  } catch (err) { next(err); }
}

// POST /instructor/quizzes/:id/publish
async function publish(req, res, next) {
  try {
    const out = await svc.publishQuiz({
      instructorId: getInstructorId(req),
      isAdmin: getIsAdmin(req),
      quizId: req.params.id,
    });
    return res.json(out);
  } catch (err) { next(err); }
}

// POST /instructor/quizzes/:id/unpublish
async function unpublish(req, res, next) {
  try {
    const out = await svc.unpublishQuiz({
      instructorId: getInstructorId(req),
      isAdmin: getIsAdmin(req),
      quizId: req.params.id,
    });
    return res.json(out);
  } catch (err) { next(err); }
}

// DELETE /instructor/quizzes/:id
async function destroy(req, res, next) {
  try {
    const out = await svc.deleteQuiz({
      instructorId: getInstructorId(req),
      isAdmin: getIsAdmin(req),
      quizId: req.params.id,
    });
    return res.status(202).json(out);
  } catch (err) { next(err); }
}

// GET /instructor/quizzes
async function listMine(req, res, next) {
  try {
    const instructorId = getInstructorId(req);
    const { courseId, q, page, limit } = req.query || {};
    const out = await svc.listMyQuizzes({
      instructorId,
      isAdmin: getIsAdmin(req),
      courseId: courseId ? String(courseId) : undefined,
      q: q ? String(q) : undefined,
      page,
      limit,
    });
    return res.json(out);
  } catch (err) { next(err); }
}

// GET /instructor/quizzes/:id
async function getOne(req, res, next) {
  try {
    const out = await svc.getMyQuiz({
      instructorId: getInstructorId(req),
      isAdmin: getIsAdmin(req),
      quizId: req.params.id,
    });
    return res.json(out);
  } catch (err) { next(err); }
}

module.exports = {
  create,
  updateBasics,
  publish,
  unpublish,
  destroy,
  listMine,
  getOne,
};
