const Stripe = require('stripe');

const STRIPE_SK = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SK ? new Stripe(STRIPE_SK, { apiVersion: '2024-06-20' }) : null;

const membership = require('./membership.service');
const courseSale = require('./courseSale.service');
const livePurchase = require('./livePurchase.service');
const resourcePurchase = require('./resourcePurchase.service');
const tutoringPurchase = require('./tutoringPurchase.service');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }


async function syncFromCheckoutSession({ sessionId }) {
  if (!stripe) throw httpError(500, 'Stripe not configured');

  const sess = await stripe.checkout.sessions.retrieve(sessionId);
  if (!sess) throw httpError(404, 'Session not found');

  if (sess.payment_status !== 'paid') {
    throw httpError(400, `Session not paid: ${sess.payment_status}`);
  }

  const meta = sess.metadata || {};
  const userId = meta.userId;

  // 1) Membership (planId present)
  if (meta.planId) {
    if (meta.planId === 'lifetime') {
      const doc = await membership.upsertLifetimeFromCheckout({ userId, session: sess });
      return { kind: 'membership', planId: 'lifetime', membership: doc, sessionId };
    }
    if (meta.planId === 'yearly') {
      // requires export of upsertYearlyFromCheckout (see patch below)
      const doc = await membership.upsertYearlyFromCheckout({ userId, session: sess });
      return { kind: 'membership', planId: 'yearly', membership: doc, sessionId };
    }
    throw httpError(400, 'Unknown membership planId');
  }

  // 2) Other purchases by type
  switch (meta.type) {
    case 'course': {
      const courseId = meta.courseId;
      await courseSale.grantCourseAfterPayment({ userId, courseId, session: sess });
      return { kind: 'course', courseId, sessionId };
    }
    case 'live-session': {
      const liveSessionId = meta.liveSessionId;
      await livePurchase.grantLiveSessionAfterPayment({ userId, liveSessionId, session: sess });
      return { kind: 'live-session', liveSessionId, sessionId };
    }
    case 'resource': {
      const resourceId = meta.resourceId;
      await resourcePurchase.grantResourceAfterPayment({ userId, resourceId, session: sess });
      return { kind: 'resource', resourceId, sessionId };
    }
    case 'quiz': {
      const quizId = meta.quizId;
      const quizSale = require('./quizSale.service');
      await quizSale.grantQuizAfterPayment({ userId, quizId, session: sess });
      return { kind: 'quiz', quizId, sessionId };
    }
    case 'tutoring': {
      await tutoringPurchase.grantTutoringAfterPayment({ session: sess });
      return { kind: 'tutoring', sessionId };
    }
    default:
      throw httpError(400, 'Unknown session type (no planId and no recognized type)');
  }
}

module.exports = { syncFromCheckoutSession };
