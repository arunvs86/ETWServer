const express = require('express');
const router = express.Router();
const { createCheckout } = require('../controllers/checkout.controller');
const { authGuard, requireRole } = require('../middlewares/auth');

router.post('/tutors/:tutorId/checkout',
  authGuard,
  requireRole('student','admin'),  // students book, admins can simulate
  createCheckout
);

module.exports = router;
