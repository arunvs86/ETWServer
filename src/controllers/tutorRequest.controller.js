// controllers/tutorRequest.controller.js
const Stripe = require('stripe');
const { Types } = require('mongoose');

const TutorRequest = require('../models/TutorRequest');
const User = require('../models/User');
const { grantTutorRequestAfterPayment } = require('../services/grantTutorRequestAfterPayment');

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

const { FRONTEND_URL = 'http://localhost:5173' } = process.env;

function httpError(status, msg) {
  const e = new Error(msg);
  e.status = status;
  return e;
}
const asyncH = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * POST /tutor-requests/checkout
 * Body: { subject, level, availabilityPref, urgency, notes }
 * Auth: required
 *
 * Creates TutorRequest (pending_payment) + Stripe Checkout Session (£30)
 */
const createTutorRequestCheckout = asyncH(async (req, res) => {
  if (!stripe) throw httpError(500, 'Stripe not configured');

  const studentId = req.auth.userId;
  const {
    subject = '',
    level = '',
    availabilityPref = '',
    urgency = 'soon',
    notes = '',
  } = req.body || {};

  if (!subject.trim()) {
    throw httpError(400, 'Subject / help required is mandatory');
  }

  const reqDoc = await TutorRequest.create({
    studentId,
    subject: subject.trim(),
    level: level.trim(),
    availabilityPref: availabilityPref.trim(),
    urgency,
    notes: notes.trim(),
    status: 'pending_payment',
  });

  // Static £30 fee
  const amountMinor = 3000;
  const currency = 'GBP';

  const studentUser = await User.findById(studentId)
    .select('name email')
    .lean();
  const studentName = studentUser?.name || 'Student';

  const productName = `Tutor matchmaking request for ${studentName}`;
  const desc = 'We will contact you within 72 hours with a tutor option';

  const successUrl = `${FRONTEND_URL}/tutors/request-success?sid={CHECKOUT_SESSION_ID}&rid=${reqDoc._id}`;
  const cancelUrl = `${FRONTEND_URL}/tutors/request?cancelled=1`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amountMinor,
          product_data: {
            name: productName,
            description: desc,
          },
        },
      },
    ],
    metadata: {
      type: 'tutor_request',
      tutorRequestId: String(reqDoc._id),
      studentId: String(studentId),
      subject: subject.trim(),
      urgency,
    },
  });

  reqDoc.stripeCheckoutSessionId = session.id;
  await reqDoc.save();

  res.json({
    url: session.url,
    sessionId: session.id,
    requestId: reqDoc._id,
  });
});

/**
 * POST /tutor-requests/:id/confirm
 * Body: { sessionId }
 * Auth: required
 *
 * - Fetch Checkout Session from Stripe
 * - Check ownership/payment
 * - Call grantTutorRequestAfterPayment
 * - Return success info
 */
const confirmTutorRequestCheckout = asyncH(async (req, res) => {
  if (!stripe) throw httpError(500, 'Stripe not configured');

  const studentId = req.auth.userId;
  const requestId = req.params.id;
  const { sessionId } = req.body || {};

  if (!Types.ObjectId.isValid(requestId)) {
    throw httpError(400, 'Invalid request id');
  }
  if (!sessionId) throw httpError(400, 'Missing sessionId');

  const reqDoc = await TutorRequest.findById(requestId);
  if (!reqDoc) throw httpError(404, 'Tutor request not found');
  if (String(reqDoc.studentId) !== String(studentId)) {
    throw httpError(403, 'Forbidden');
  }

  // Pull Checkout Session
  const sess = await stripe.checkout.sessions.retrieve(sessionId);

  // Metadata guard (same pattern as tutoring)
  const metaOk =
    sess?.metadata?.type === 'tutor_request' &&
    String(sess?.metadata?.tutorRequestId) === String(reqDoc._id) &&
    String(sess?.metadata?.studentId) === String(studentId);

  if (!metaOk) throw httpError(400, 'Session metadata mismatch');

  // Payment guard
  const paid =
    sess?.payment_status === 'paid' ||
    sess?.status === 'complete';

  if (!paid) throw httpError(409, 'Payment not completed yet');

  // Delegate the finalisation (status flip, order, emails)
  const out = await grantTutorRequestAfterPayment({ session: sess });

  // re-fetch (to return fresh)
  const fresh = await TutorRequest.findById(requestId).lean();

  return res.json({
    ok: true,
    status: fresh.status,
    request: {
      id: String(fresh._id),
      subject: fresh.subject,
      level: fresh.level,
      availabilityPref: fresh.availabilityPref,
      urgency: fresh.urgency,
      notes: fresh.notes,
      createdAt: fresh.createdAt,
    },
  });
});

module.exports = {
  createTutorRequestCheckout,
  confirmTutorRequestCheckout,
};
