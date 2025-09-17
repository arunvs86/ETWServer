// services/tutoringPurchase.service.js
const TutoringSession = require('../models/TutoringSession');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

// Replace with real Zoom/Meet later
async function generateMeetingLink(booking) {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base}/meeting/${booking._id}`;
}

/**
 * Finalize a tutoring booking after Stripe Checkout succeeds.
 * Safe to run multiple times (idempotent).
 */
async function grantTutoringAfterPayment({ session: stripeCheckout }) {
  const checkoutId = stripeCheckout.id;
  const paymentIntentId = typeof stripeCheckout.payment_intent === 'string'
    ? stripeCheckout.payment_intent
    : stripeCheckout.payment_intent?.id;

  const meta = stripeCheckout.metadata || {};
  const sessionId = meta.tutoringSessionId;

  // Find the hold booking
  let booking = null;
  if (sessionId) booking = await TutoringSession.findById(sessionId);
  if (!booking && checkoutId) {
    booking = await TutoringSession.findOne({ stripeCheckoutSessionId: checkoutId });
  }
  if (!booking) throw httpError(404, 'Tutoring booking not found');

  // Optional sanity checks
  if (meta.studentId && String(booking.studentId) !== String(meta.studentId)) {
    throw httpError(400, 'Student mismatch');
  }
  if (meta.tutorId && String(booking.tutorId) !== String(meta.tutorId)) {
    throw httpError(400, 'Tutor mismatch');
  }

  // Idempotency
  if (['confirmed','completed','refunded'].includes(booking.status)) {
    return { ok: true, already: true, bookingId: String(booking._id) };
  }

  // Attach refs and confirm
  if (!booking.stripeCheckoutSessionId && checkoutId) {
    booking.stripeCheckoutSessionId = checkoutId;
  }
  if (paymentIntentId) booking.stripePaymentIntentId = paymentIntentId;

  booking.status = 'confirmed';
  booking.meetingLink = await generateMeetingLink(booking);

  await booking.save();

  // TODO: send emails to tutor & student with booking.meetingLink + ICS
  return { ok: true, bookingId: String(booking._id) };
}

module.exports = { grantTutoringAfterPayment };
