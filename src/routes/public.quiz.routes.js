// Public discovery + quiz view (no auth required for GETs)
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/publicQuiz.controller');
const { authGuard } = require('../middlewares/auth');

// Public
router.get('/quizzes', ctrl.list);
router.get('/quizzes/:slug', ctrl.getBySlug);
router.post('/quizzes/:slug/checkout', authGuard, ctrl.checkout);

module.exports = router;
