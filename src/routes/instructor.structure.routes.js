// src/routes/instructor.structure.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/instructorStructure.controller');

// NOTE: add real auth middleware when ready
 const { authGuard, requireRole } = require('../middlewares/auth');
 router.use(authGuard, requireRole('instructor'));

router.get('/courses/:id/curriculum', ctrl.getCurriculum);

// Sections
router.post('/courses/:id/sections', ctrl.createSection);
router.patch('/sections/:sectionId', ctrl.updateSection);
router.post('/sections/:sectionId/reorder', ctrl.reorderSection);
router.delete('/sections/:sectionId', ctrl.deleteSection);

// Lessons
router.post('/sections/:sectionId/lessons', ctrl.createLesson);
router.patch('/lessons/:lessonId', ctrl.updateLesson);
router.post('/lessons/:lessonId/reorder', ctrl.reorderLesson);
router.delete('/lessons/:lessonId', ctrl.deleteLesson);

module.exports = router;
