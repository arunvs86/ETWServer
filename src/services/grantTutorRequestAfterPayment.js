// services/grantTutorRequestAfterPayment.js
const TutorRequest = require('../models/TutorRequest');
const User = require('../models/User');
// const { httpError } = require('../utils/httpError'); // if you don't have this util, I'll inline later
const { sendTutorRequestEmails } = require('./sendTutorRequestEmails');
const { recordStripeOrder } = require('./orderRecorder.service'); // adjust path if different

function httpError(status, msg) {
    const err = new Error(msg);
    err.status = status;
    return err;
  }

/**
 * grantTutorRequestAfterPayment
 *
 * This mirrors grantTutoringAfterPayment, but for the £30 matchmaking service.
 *
 * @param {object} opts
 * @param {object} opts.session - Stripe Checkout Session object
 *
 * Returns { ok: true, requestId: string }
 */
async function grantTutorRequestAfterPayment({ session: stripeCheckout }) {
  console.log('[grantTutorRequest] start for checkout.id=%s meta=%o',
    stripeCheckout.id,
    stripeCheckout.metadata
  );

  const checkoutId = stripeCheckout.id;
  const paymentIntentId =
    typeof stripeCheckout.payment_intent === 'string'
      ? stripeCheckout.payment_intent
      : stripeCheckout.payment_intent?.id;

  const meta = stripeCheckout.metadata || {};
  const reqId = meta.tutorRequestId;

  // 1. locate the TutorRequest
  let reqDoc = null;
  if (reqId) reqDoc = await TutorRequest.findById(reqId);
  if (!reqDoc && checkoutId)
    reqDoc = await TutorRequest.findOne({
      stripeCheckoutSessionId: checkoutId,
    });
  if (!reqDoc) throw httpError(404, 'Tutor request not found');

  // 2. If already processed, bail out gracefully
  //    'pending' means it's paid and waiting for manual match
  if (['pending', 'matched', 'closed', 'refunded'].includes(reqDoc.status)) {
    return { ok: true, already: true, requestId: String(reqDoc._id) };
  }

  // 3. attach Stripe IDs for traceability
  if (!reqDoc.stripeCheckoutSessionId && checkoutId) {
    reqDoc.stripeCheckoutSessionId = checkoutId;
  }
  if (paymentIntentId) {
    reqDoc.stripePaymentIntentId = paymentIntentId; // you may add this field to the model if you like
  }

  // 4. flip status to 'pending'
  reqDoc.status = 'pending';
  await reqDoc.save();

  // 5. send emails
  try {
    const student = await User.findById(reqDoc.studentId)
      .select('name email')
      .lean();

    await sendTutorRequestEmails({
      student,
      request: reqDoc.toObject ? reqDoc.toObject() : reqDoc,
    });
  } catch (err) {
    console.error('[tutorRequest] email notify failed:', err.message);
  }

  // 6. write Order
  try {
    const amountMinor =
      stripeCheckout?.amount_total ??
      stripeCheckout?.amount_subtotal ??
      3000; // fallback 3000 (£30)

    const currency = (stripeCheckout?.currency || 'GBP').toUpperCase();

    await recordStripeOrder({
      userId: String(reqDoc.studentId),
      session: stripeCheckout,
      items: [
        {
          kind: 'tutor_request',
          refId: reqDoc._id,
          titleSnapshot: 'Tutor Matchmaking Request',
          amountMinor,
          currency,
          metadata: {
            subject: reqDoc.subject,
            urgency: reqDoc.urgency,
          },
        },
      ],
    });
  } catch (e) {
    console.error('[ORDER] tutor-request order upsert failed:', e?.message || e);
  }

  return { ok: true, requestId: String(reqDoc._id) };
}

module.exports = {
  grantTutorRequestAfterPayment,
};
