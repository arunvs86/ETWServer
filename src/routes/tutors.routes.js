// routes/tutors.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/tutors.controller');
const meTutor = require('../controllers/meTutor.controller');
const sessions = require('../controllers/sessions.controller');
const { zodValidator, createProfileSchema, updateProfileSchema } = require('../validators/tutorProfile.validators');
const { authGuard, requireRole } = require('../middlewares/auth');
const { Types } = require('mongoose');                            // <-- ADD

// If tutorId is not a valid ObjectId, stop with 404 BEFORE hitting controllers
router.param('tutorId', (req, res, next, id) => {                 // <-- ADD
  if (!Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: 'Tutor not found' });
  }
  next();
});

// (Optional) If someone hits backend /tutors/booking-success by mistake, don't 500
router.get('/booking-success', (_req, res) => res.status(204).end()); // <-- OPTIONAL

// ---------- Public ----------
router.get('/', ctrl.getPublicTutors);
router.get('/:tutorId/availability', sessions.getTutorAvailabilityPublic);
router.post('/:tutorId/checkout', authGuard, sessions.createTutoringCheckout);

// ---------- Me (instructor) ----------
router.get('/me/tutor-profile', authGuard, requireRole('instructor'), ctrl.getMyTutorProfile);
router.post('/me/tutor-profile', authGuard, requireRole('instructor'),
  zodValidator(createProfileSchema), ctrl.createMyTutorProfile);
router.patch('/me/tutor-profile', authGuard, requireRole('instructor'),
  zodValidator(updateProfileSchema), ctrl.updateMyTutorProfile);
router.delete('/me/tutor-profile', authGuard, requireRole('instructor'), ctrl.deleteMyTutorProfile);

// ---------- Owner availability ----------
router.get('/me/tutor/availability', authGuard, requireRole('instructor'), meTutor.getAvailability);
router.put('/me/tutor/availability', authGuard, requireRole('instructor'), meTutor.upsertAvailability);

// ---------- Admin ----------
router.patch('/admin/:tutorId/listing', authGuard, requireRole('admin'), ctrl.adminSetTutorListing);

// ---------- Keep LAST ----------
router.get('/:tutorId', ctrl.getTutorPublicDetail);

router.get('/checkout-status', sessions.getTutoringCheckoutStatus);


module.exports = router;
