// src/routes/course.routes.js
const express = require('express');
const router = express.Router();
const courseController = require('../controllers/course.controller');

// Public list (search/filters/pagination/sort)
router.get('/', courseController.getCourses);

// Public single course by slug
router.get('/:slug', courseController.getCourseBySlug);

module.exports = router;
