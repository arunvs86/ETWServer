// src/routes/me.courses.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/meCourse.controller');


const { authGuard, requireRole } = require('../middlewares/auth');
router.use(authGuard)

router.get('/me/courses/:slug', ctrl.getCourse);
router.get('/me/lessons/:lessonId', ctrl.getLesson);

module.exports = router;
