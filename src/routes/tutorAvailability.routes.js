// routes/tutorAvailability.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/availability.controller');
const { authGuard, requireRole } = require('../middlewares/auth');

const {
  zodValidator,
  upsertWeeklySchema,
  upsertExceptionsSchema,
  updateSettingsSchema,
  publicAvailabilityQuerySchema
} = require('../validators/tutorAvailability.validators');

// ----- Me (instructor) -----
router.get('/me/tutor-availability', authGuard, requireRole('instructor'), ctrl.getMyAvailability);

router.put('/me/tutor-availability/weekly',
  authGuard, requireRole('instructor'),
  zodValidator(upsertWeeklySchema),
  ctrl.putWeekly
);

router.put('/me/tutor-availability/exceptions',
  authGuard, requireRole('instructor'),
  zodValidator(upsertExceptionsSchema),
  ctrl.putExceptions
);

router.patch('/me/tutor-availability/settings',
  authGuard, requireRole('instructor'),
  zodValidator(updateSettingsSchema),
  ctrl.patchSettings
);

// ----- Public -----
router.get('/tutors/:tutorId/availability',
  zodValidator(publicAvailabilityQuerySchema, 'query'),
  ctrl.getPublicAvailability
);

module.exports = router;
