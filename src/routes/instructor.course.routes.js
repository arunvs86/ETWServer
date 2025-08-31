// src/routes/instructor.course.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/instructorCourse.controller');

// NOTE: plug in your real auth middlewares here.
const { authGuard, requireRole } = require('../middlewares/auth');
router.use(authGuard, requireRole('instructor','admin'));

// Course shell
router.get('/courses', ctrl.listMine);
router.get('/courses/:id', ctrl.getOne);
router.post('/courses', ctrl.createDraft);
router.patch('/courses/:id', ctrl.updateBasics);
router.patch('/courses/:id/pricing', ctrl.updatePricing);
router.post('/courses/:id/publish', ctrl.publish);
router.post('/courses/:id/unpublish', ctrl.unpublish);
router.post('/courses/:id/archive', ctrl.archive);
router.post('/courses/:id/restore', ctrl.restore);
router.delete('/courses/:id', ctrl.destroy);

// Single-lesson (YouTube) endpoints
router.get('/courses/:id/lesson', ctrl.getSingleLesson);
router.put('/courses/:id/lesson', ctrl.upsertSingleLesson);
router.delete('/courses/:id/lesson', ctrl.deleteSingleLesson);

module.exports = router;
