// src/routes/instructor.quiz.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/instructorQuiz.controller');

const { authGuard, requireRole } = require('../middlewares/auth');
router.use(authGuard, requireRole('instructor','admin'));

// List my quizzes (optionally filter by courseId), paginated
router.get('/quizzes', ctrl.listMine);

// Get single quiz I own
router.get('/quizzes/:id', ctrl.getOne);

// Create a new quiz attached to a course I own
router.post('/quizzes', ctrl.create);

// Update basics/rules of my quiz
router.patch('/quizzes/:id', ctrl.updateBasics);

// Publish / Unpublish
router.post('/quizzes/:id/publish', ctrl.publish);
router.post('/quizzes/:id/unpublish', ctrl.unpublish);

// Delete (only if not published and no attempts)
router.delete('/quizzes/:id', ctrl.destroy);

module.exports = router;
