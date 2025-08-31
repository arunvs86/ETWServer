// src/controllers/course.controller.js
const courseService = require('../services/course.service');

// GET /courses
async function getCourses(req, res, next) {
  try {
    const result = await courseService.listCourses(req.query || {});
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

// GET /courses/:slug
async function getCourseBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const course = await courseService.getCourseBySlug(slug);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    return res.json({ course });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getCourses,
  getCourseBySlug,
};
