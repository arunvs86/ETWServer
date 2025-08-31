const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/instructorQuizQuestion.controller');

const { authGuard, requireRole } = require('../middlewares/auth');
router.use(authGuard, requireRole('instructor','admin'));

router.get('/quizzes/:quizId/questions', ctrl.list);
router.post('/quizzes/:quizId/questions', ctrl.create);
router.patch('/questions/:questionId', ctrl.update);
router.post('/questions/:questionId/reorder', ctrl.reorder);
router.delete('/questions/:questionId', ctrl.destroy);

module.exports = router;
