// Playing attempts (auth required)
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/publicQuiz.controller');
const { authGuard } = require('../middlewares/auth');

// Start attempt requires login (even for public quizzes)
// because QuizAttempt.userId is required
router.post('/quizzes/:slug/start', authGuard, ctrl.start);

// Answer autosave + submit + view attempt (auth)
router.patch('/attempts/:attemptId/answers', authGuard, ctrl.upsertAnswers);
router.post('/attempts/:attemptId/submit', authGuard, ctrl.submit);
router.get('/attempts/:attemptId', authGuard, ctrl.getAttempt);

module.exports = router;
