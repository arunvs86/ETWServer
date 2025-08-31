// src/controllers/progress.controller.js
const svc = require('../services/progress.service');

function getUserId(req) {
  return req.user?.id || req.user?._id || req.headers['x-user-id'] || null;
}

// POST /me/progress/lessons/:lessonId/complete
async function complete(req, res, next) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    const out = await svc.completeLesson({ userId, lessonId: req.params.lessonId });
    return res.json(out);
  } catch (err) { next(err); }
}

// POST /me/progress/lessons/:lessonId/uncomplete
async function uncomplete(req, res, next) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    const out = await svc.uncompleteLesson({ userId, lessonId: req.params.lessonId });
    return res.json(out);
  } catch (err) { next(err); }
}

// GET /me/courses/:courseId/progress
async function courseProgress(req, res, next) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    const out = await svc.getCourseProgress({ userId, courseId: req.params.courseId });
    return res.json(out);
  } catch (err) { next(err); }
}

module.exports = { complete, uncomplete, courseProgress };
