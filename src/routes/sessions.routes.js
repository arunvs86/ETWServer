// routes/sessions.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/sessions.controller');
const { authGuard /*, requireRole */ } = require('../middlewares/auth');
const { zodBody, zodQuery, /* createSessionSchema, */ rescheduleSchema, listMySessionsQuerySchema } =
  require('../validators/tutoringSession.validators');

// IMPORTANT: Do NOT define `/tutors/:tutorId/sessions` here.
// Public availability + checkout live under routes/tutors.routes.js

// Me: list my sessions (student or tutor view via ?role=)
router.get('/me/tutoring-sessions', authGuard, zodQuery(listMySessionsQuerySchema), ctrl.listMine);

// Me: get a specific session
router.get('/me/tutoring-sessions/:id', authGuard, ctrl.getMine);

// Me: cancel
router.patch('/me/tutoring-sessions/:id/cancel', authGuard, ctrl.cancelMine);

// Me: reschedule
router.patch('/me/tutoring-sessions/:id/reschedule', authGuard, zodBody(rescheduleSchema), ctrl.rescheduleMine);

router.get('/tutors/checkout-status', ctrl.getTutoringCheckoutStatus);
router.get('/tutors/sync', ctrl.syncTutoringFromCheckoutPublic);       // <-- add this
router.post('/me/tutoring-sessions/:id/confirm', ctrl.confirmTutoringCheckout); // <-- add

module.exports = router;
