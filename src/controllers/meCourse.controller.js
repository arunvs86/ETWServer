  // src/controllers/meCourse.controller.js
  const svc = require('../services/meCourse.service');

  function getUserId(req) {
    return req.user?.id || req.user?._id || req.headers['x-user-id'] || null;
  }

  // GET /me/courses/:slug
  async function getCourse(req, res, next) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Auth required' });

      const { slug } = req.params;
      const out = await svc.getEnrolledCourseBySlug({ userId, slug });
      return res.json(out);
    } catch (err) { next(err); }
  }

  // GET /me/lessons/:lessonId
  async function getLesson(req, res, next) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Auth required' });

      const { lessonId } = req.params;
      const out = await svc.getLessonById({ userId, lessonId });
      return res.json(out);
    } catch (err) { next(err); }
  }

  module.exports = { getCourse, getLesson };
