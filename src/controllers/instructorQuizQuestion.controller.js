// src/controllers/instructorQuizQuestion.controller.js
const svc = require('../services/instructorQuizQuestion.service');

const getInstructorId = (req) => req.user?.id || req.user?._id || req.headers['x-user-id'] || null;
const getIsAdmin = (req) => String(req.user?.role || req.headers['x-user-role']).toLowerCase() === 'admin';

async function list(req, res, next) { try {
  const out = await svc.list({
    instructorId: getInstructorId(req),
    isAdmin: getIsAdmin(req),
    quizId: req.params.quizId
  });
  res.json(out);
} catch (e) { next(e); } }

async function create(req, res, next) { try {
  const out = await svc.create({
    instructorId: getInstructorId(req),
    isAdmin: getIsAdmin(req),
    quizId: req.params.quizId,
    payload: req.body || {}
  });
  res.status(201).json(out);
} catch (e) { next(e); } }

async function update(req, res, next) { try {
  const out = await svc.update({
    instructorId: getInstructorId(req),
    isAdmin: getIsAdmin(req),
    questionId: req.params.questionId,
    payload: req.body || {}
  });
  res.json(out);
} catch (e) { next(e); } }

async function reorder(req, res, next) { try {
  const out = await svc.reorder({
    instructorId: getInstructorId(req),
    isAdmin: getIsAdmin(req),
    questionId: req.params.questionId,
    toIndex: req.body?.toIndex
  });
  res.json(out);
} catch (e) { next(e); } }

async function destroy(req, res, next) { try {
  const out = await svc.destroy({
    instructorId: getInstructorId(req),
    isAdmin: getIsAdmin(req),
    questionId: req.params.questionId
  });
  res.status(202).json(out);
} catch (e) { next(e); } }

module.exports = { list, create, update, reorder, destroy };
