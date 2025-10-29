// routes/tutorRequest.routes.js
const express = require('express');
const router = express.Router();

const { authGuard } = require('../middlewares/auth');
const ctrl = require('../controllers/tutorRequest.controller');

console.log("In req route")
// Student creates a request + Stripe checkout
router.post('/checkout', authGuard, ctrl.createTutorRequestCheckout);

// Success page calls this to confirm after Stripe payment
router.post('/:id/confirm', authGuard, ctrl.confirmTutorRequestCheckout);

module.exports = router;
