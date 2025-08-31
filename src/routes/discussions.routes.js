const express = require('express');
const ctrl = require('../controllers/discussions.controller');

// If you have your own authGuard, import and use it here:
const { authGuard,requireInstructorOrAdmin } = require('../middlewares/auth'); // adapt path if needed

const r = express.Router();

// QUESTIONS
r.post('/questions', authGuard, ctrl.createQuestion);
r.get('/questions', authGuard, ctrl.listQuestions);
r.get('/questions/:id', authGuard, ctrl.getQuestion);
r.patch('/questions/:id', authGuard, ctrl.editQuestion);
r.post('/questions/:id/upvote', authGuard, ctrl.toggleUpvoteQuestion);
r.post('/questions/:id/close', authGuard, requireInstructorOrAdmin, ctrl.closeOrLockQuestion);

// ANSWERS (instructor/admin only to create)
r.post('/questions/:id/answers', authGuard, requireInstructorOrAdmin, ctrl.createAnswer);
r.patch('/answers/:answerId', authGuard, ctrl.editAnswer);
r.delete('/answers/:answerId', authGuard, ctrl.deleteAnswer);
r.post('/answers/:answerId/upvote', authGuard, ctrl.toggleUpvoteAnswer);

// ACCEPT
r.post('/questions/:id/accept/:answerId', authGuard, ctrl.acceptAnswer);

// COMMENTS (only question author)
r.post('/questions/:id/comments', authGuard, ctrl.addComment);
r.delete('/comments/:commentId', authGuard, ctrl.deleteComment);

module.exports = r;
