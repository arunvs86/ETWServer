// src/routes/me.progress.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/progress.controller');

const { authGuard, requireRole } = require('../middlewares/auth');
router.use(authGuard)

router.post('/me/progress/lessons/:lessonId/complete', ctrl.complete);
router.post('/me/progress/lessons/:lessonId/uncomplete', ctrl.uncomplete);
router.get('/me/courses/:courseId/progress', ctrl.courseProgress);

module.exports = router;
