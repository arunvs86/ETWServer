// routes/sessions.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/sessions.controller');
const { authGuard, requireRole } = require('../middlewares/auth');
const { zodBody, zodQuery, createSessionSchema, rescheduleSchema, listMySessionsQuerySchema } =
  require('../validators/tutoringSession.validators');

// Create HOLD (student creates a booking with a tutor)
router.post('/tutors/:tutorId/sessions',
  authGuard, requireRole('student','admin'), // allow admins to simulate
  zodBody(createSessionSchema),
  ctrl.createHold
);

// Me: list my sessions (as student or tutor)
router.get('/me/tutoring-sessions',
  authGuard,
  zodQuery(listMySessionsQuerySchema),
  ctrl.listMine
);

// Me: get a specific session
router.get('/me/tutoring-sessions/:id',
  authGuard,
  ctrl.getMine
);

// Me: cancel
router.patch('/me/tutoring-sessions/:id/cancel',
  authGuard,
  ctrl.cancelMine
);

// Me: reschedule
router.patch('/me/tutoring-sessions/:id/reschedule',
  authGuard,
  zodBody(rescheduleSchema),
  ctrl.rescheduleMine
);

module.exports = router;
