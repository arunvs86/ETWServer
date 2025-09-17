// routes/tutorManage.routes.js
const express = require('express');
const router = express.Router();

const sessCtrl = require('../controllers/sessions.controller');
const { authGuard, requireRole } = require('../middlewares/auth');
const { zodQuery, zodBody, listQuery, cancelRequestBody } = require('../validators/tutorManage.validators');

// Tutor session list
router.get('/me/tutor/sessions',
  authGuard, requireRole('instructor'),
  zodQuery(listQuery),
  sessCtrl.listAsTutor
);

// Tutor completes a delivered session
router.patch('/me/tutor/sessions/:id/complete',
  authGuard, requireRole('instructor'),
  sessCtrl.completeAsTutor
);

// Student requests cancel (inside 24h window)
router.patch('/me/tutoring-sessions/:id/cancel-request',
  authGuard, requireRole('student'),
  zodBody(cancelRequestBody),
  sessCtrl.requestCancel
);

// Tutor approves a cancel request
router.patch('/me/tutor/sessions/:id/approve-cancel',
  authGuard, requireRole('instructor'),
  sessCtrl.approveCancelAsTutor
);

module.exports = router;
