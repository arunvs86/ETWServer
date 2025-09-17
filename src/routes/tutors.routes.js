// routes/tutors.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/tutors.controller');
const { zodValidator, createProfileSchema, updateProfileSchema } = require('../validators/tutorProfile.validators');

// These middlewares should already exist in your app:
const { authGuard, requireRole } = require('../middlewares/auth'); 
// requireRole('instructor') / requireRole('admin')

// ---------- Public ----------
router.get('/', ctrl.getPublicTutors);
router.get('/:tutorId', ctrl.getTutorPublicDetail);

// ---------- Me (instructor) ----------
router.get('/me/tutor-profile', authGuard, requireRole('instructor'), ctrl.getMyTutorProfile);
router.post('/me/tutor-profile', authGuard, requireRole('instructor'),
  zodValidator(createProfileSchema),
  ctrl.createMyTutorProfile
);
router.patch('/me/tutor-profile', authGuard, requireRole('instructor'),
  zodValidator(updateProfileSchema),
  ctrl.updateMyTutorProfile
);
// soft delete (unlist)
router.delete('/me/tutor-profile', authGuard, requireRole('instructor'), ctrl.deleteMyTutorProfile);

// ---------- Admin ----------
router.patch('/admin/:tutorId/listing', authGuard, requireRole('admin'), ctrl.adminSetTutorListing);

module.exports = router;
