const express = require('express');
const router = express.Router();

const meTutor = require('../controllers/meTutor.controller');
const { authGuard, requireRole } = require('../middlewares/auth');

// mount these AS /me/tutor/profile & /me/tutor/availability by mounting router at /me
router.get('/tutor/profile',       authGuard, requireRole('instructor','admin'), meTutor.getProfile);
router.put('/tutor/profile',       authGuard, requireRole('instructor','admin'), meTutor.upsertProfile);
router.get('/tutor/availability',  authGuard, requireRole('instructor','admin'), meTutor.getAvailability);
router.put('/tutor/availability',  authGuard, requireRole('instructor','admin'), meTutor.upsertAvailability);

module.exports = router;
