// src/controllers/publicQuiz.controller.js
const svc = require('../services/publicQuiz.service');
const quizSale = require('../services/quizSale.service')
const getUserId = (req) => req.user?.id || req.user?._id || req.headers['x-user-id'] || null;

// GET /quizzes
async function list(req, res, next) {
  try {
    const { q, page, limit } = req.query || {};
    const out = await svc.listPublished({ q, page, limit });
    res.json(out);
  } catch (e) { next(e); }
}

// GET /quizzes/:slug
async function getBySlug(req, res, next) {
  try {
    const out = await svc.getBySlugPublic({
      slug: String(req.params.slug),
      userId: req.user?.id || req.user?._id || req.headers['x-user-id'] || null, // ✅ pass userId if present
    });
    res.json(out);
  } catch (e) { next(e); }
}

// POST /quizzes/:slug/start  (auth required)
async function start(req, res, next) {
  try {
    const out = await svc.startAttempt({ slug: String(req.params.slug), userId: getUserId(req) });
    res.status(201).json(out);
  } catch (e) { next(e); }
}

// PATCH /attempts/:attemptId/answers  (auth)
async function upsertAnswers(req, res, next) {
  try {
    const out = await svc.upsertAnswers({
      attemptId: req.params.attemptId,
      userId: getUserId(req),
      patchAnswers: req.body?.answers || [],
    });
    res.json(out);
  } catch (e) { next(e); }
}

// POST /attempts/:attemptId/submit  (auth)
async function submit(req, res, next) {
  try {
    const out = await svc.submitAttempt({
      attemptId: req.params.attemptId,
      userId: getUserId(req),
    });
    res.json(out);
  } catch (e) { next(e); }
}

// GET /attempts/:attemptId  (auth)
async function getAttempt(req, res, next) {
  try {
    const out = await svc.getAttempt({
      attemptId: req.params.attemptId,
      userId: getUserId(req),
    });
    res.json(out);
  } catch (e) { next(e); }
}

async function checkout(req, res, next) {
  try {
    const out = await quizSale.createQuizCheckoutBySlug({
      userId: getUserId(req),
      slug: String(req.params.slug)
    });
    res.status(201).json(out);
  } catch (e) { next(e); }
}

module.exports = {
  list,
  getBySlug,
  start,
  upsertAnswers,
  submit,
  getAttempt,
  checkout
};
