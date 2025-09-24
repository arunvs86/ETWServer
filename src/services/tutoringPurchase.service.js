// src/services/tutoringPurchase.service.js
const TutoringSession = require('../models/TutoringSession');
const TutorProfile = require('../models/TutorProfile');
const User = require('../models/User');
const { sendTutoringEmails } = require('./notifyPurchase');
const { recordStripeOrder } = require('./orderRecorder.service');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

function extractFirstUrl(str = '') {
  const m = String(str || '').match(/\bhttps?:\/\/[^\s)]+/i);
  return m ? m[0] : null;
}

function buildMeetingLink({ sessionId, tutorProfile }) {
  const fromNote = extractFirstUrl(tutorProfile?.meetingNote || '');
  if (fromNote) return fromNote;
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/meeting/${sessionId}`;
}

async function grantTutoringAfterPayment({ session: stripeCheckout }) {
  console.log('[grantTutoring] start for checkout.id=%s meta=%o', stripeCheckout.id, stripeCheckout.metadata);

  const checkoutId = stripeCheckout.id;
  const paymentIntentId = typeof stripeCheckout.payment_intent === 'string'
    ? stripeCheckout.payment_intent
    : stripeCheckout.payment_intent?.id;

  const meta = stripeCheckout.metadata || {};
  const sessionId = meta.tutoringSessionId;

  let booking = null;
  if (sessionId) booking = await TutoringSession.findById(sessionId);
  if (!booking && checkoutId) booking = await TutoringSession.findOne({ stripeCheckoutSessionId: checkoutId });
  if (!booking) throw httpError(404, 'Tutoring booking not found');

  if (['confirmed','completed','refunded'].includes(booking.status)) {
    return { ok: true, already: true, bookingId: String(booking._id) };
  }

  if (!booking.stripeCheckoutSessionId && checkoutId) {
    booking.stripeCheckoutSessionId = checkoutId;
  }
  if (paymentIntentId) booking.stripePaymentIntentId = paymentIntentId;

  const tutorProfile = await TutorProfile.findOne({ userId: booking.tutorId }).lean();
  const link = buildMeetingLink({ sessionId: String(booking._id), tutorProfile });

  booking.status = 'confirmed';
  booking.meetingLink = link;
  await booking.save();

  try {
    const [student, tutor] = await Promise.all([
      User.findById(booking.studentId).select('name email').lean(),
      User.findById(booking.tutorId).select('name email').lean(),
    ]);
    await sendTutoringEmails({
      student, tutor,
      session: booking.toObject ? booking.toObject() : booking,
      meetingLink: link,
      tutorProfile
    });
  } catch (err) {
    console.error('[tutoring] email notify failed:', err.message);
  }

  try {
    const amountMinor =
      stripeCheckout?.amount_total ??
      stripeCheckout?.amount_subtotal ??
      booking?.priceMinor ?? 0;
    const currency = (stripeCheckout?.currency || booking?.currency || 'GBP').toUpperCase();
  
    await recordStripeOrder({
      userId: String(booking.studentId),
      session: stripeCheckout,
      items: [{
        kind: 'tutoring',
        refId: booking._id,
        titleSnapshot: booking.title || '1:1 Tutoring Session',
        amountMinor,
        currency,
        metadata: {
          tutorId: String(booking.tutorId),
          durationMin: booking.durationMin,
        },
      }],
    });
  } catch (e) {
    console.error('[ORDER] tutoring order upsert failed:', e?.message || e);
  }

  return { ok: true, bookingId: String(booking._id) };
}

module.exports = { grantTutoringAfterPayment };
