const Stripe = require('stripe');
const { Types } = require('mongoose');
const Course = require('../models/Course');
const Order  = require('../models/Order');
const Enrollment = require('../models/Enrollment');
const Membership = require('../models/Membership');

const STRIPE_SK = process.env.STRIPE_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const stripe = STRIPE_SK ? new Stripe(STRIPE_SK, { apiVersion: '2024-06-20' }) : null;

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const toStripeCurrency = (c) => String(c || 'GBP').toLowerCase(); // 'GBP' -> 'gbp'

/** Create Product once and a Price (GBP) that matches current amountMinor */
async function ensureStripeForCourse(courseId) {
  const course = await Course.findById(courseId);
  if (!course) throw httpError(404, 'Course not found');
  if (!stripe) throw httpError(500, 'Stripe not configured');

  // Free course → nothing to do
  if (course.pricing?.amountMinor === 0) return course;

  // 1) Product
  if (!course.stripe?.productId) {
    const product = await stripe.products.create({
      name: course.title,
      metadata: { courseId: String(course._id), slug: course.slug || '' },
    });
    course.stripe = { ...(course.stripe || {}), productId: product.id };
  }

  // 2) Price — create a new one if amount/currency changed
  const amount = course.pricing.amountMinor;
  const currency = toStripeCurrency(course.pricing.currency);
  const price = await stripe.prices.create({
    currency,
    unit_amount: amount,
    product: course.stripe.productId,
    metadata: { courseId: String(course._id), slug: course.slug || '' },
  });

  course.stripe.priceId = price.id;
  await course.save();
  return course;
}

/** Create a one-time Checkout session for a course */
async function createCourseCheckout({ userId, courseId }) {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(courseId)) {
    throw httpError(400, 'Invalid ids');
  }
  const course = await Course.findById(courseId);
  if (!course) throw httpError(404, 'Course not found');

  // Block checkout if free or membership already unlocks it
  if (course.pricing.amountMinor === 0) throw httpError(400, 'Course is free');

  const mem = await Membership.findOne({ userId });
  const now = new Date();
  const memberActive = !!mem && (mem.status === 'active' || mem.status === 'trialing') &&
    now >= mem.currentPeriodStart && now < mem.currentPeriodEnd;

  if (memberActive && course.pricing.includedInMembership) {
    throw httpError(400, 'Membership already unlocks this course');
  }

  if (!stripe) throw httpError(500, 'Stripe not configured');

  // Ensure we have Product/Price for the current price
  const ensured = await ensureStripeForCourse(courseId);

  const successUrl = `${FRONTEND_URL}/courses/${course.slug || courseId}?purchase=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${FRONTEND_URL}/courses/${course.slug || courseId}?purchase=cancel`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: ensured.stripe.priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      type: 'course',
      userId: String(userId),
      courseId: String(courseId),
    },
  });

  return { checkoutUrl: session.url, sessionId: session.id };
}

async function syncFromCheckoutSessionPublic({ sessionId }) {
  if (!stripe) throw httpError(500, 'Stripe not configured');

  const sess = await stripe.checkout.sessions.retrieve(sessionId);
  if (!sess) throw httpError(404, 'Session not found');

  if (sess.payment_status !== 'paid') {
    throw httpError(400, `Session not paid: ${sess.payment_status}`);
  }

  // Must have metadata from createCourseCheckout
  const type = sess.metadata?.type;
  const userId = sess.metadata?.userId;
  const courseId = sess.metadata?.courseId;

  if (type !== 'course') throw httpError(400, 'Not a course session');
  if (!userId || !courseId) throw httpError(400, 'Missing metadata (userId/courseId)');

  // Grant order + enrollment (idempotent by idempotencyKey in grantCourseAfterPayment)
  await module.exports.grantCourseAfterPayment({ userId, courseId, session: sess });

  // Return current enrollment for convenience
  const Enrollment = require('../models/Enrollment');
  const { Types } = require('mongoose');
  const doc = await Enrollment.findOne({
    userId: new Types.ObjectId(String(userId)),
    courseId: new Types.ObjectId(String(courseId)),
  }).lean();

  return { enrollment: doc || null, sessionId };
}

/** On webhook success, create/settle Order and grant Enrollment */
async function grantCourseAfterPayment({ userId, courseId, session }) {
  const course = await Course.findById(courseId);
  if (!course) return;

  const amountMinor = session.amount_total ?? session.amount_subtotal ?? course.pricing.amountMinor;
  const currency = (session.currency || toStripeCurrency(course.pricing.currency)).toUpperCase();

  // Upsert/settle Order
  const idempotencyKey = String(session.payment_intent || session.id);
  await Order.findOneAndUpdate(
    { idempotencyKey },
    {
      userId,
      items: [{
        kind: 'course',
        refId: course._id,
        titleSnapshot: course.title,
        amountMinor,
        currency,
        metadata: { slug: course.slug },
      }],
      totalAmountMinor: amountMinor,
      currency,
      status: 'paid',
      paymentProvider: 'stripe',
      stripe: {
        checkoutSessionId: session.id,
        paymentIntentId: session.payment_intent || undefined,
        customerId: session.customer || undefined,
      },
      idempotencyKey,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Upsert Enrollment (via purchase)
  const now = new Date();
  const result = await Enrollment.findOneAndUpdate(
    { userId, courseId },
    {
      $setOnInsert: {
        userId, courseId,
        via: 'purchase',
        status: 'active',
        activatedAt: now,
        expiresAt: null,
      },
    },
    { upsert: true, new: true, rawResult: true, setDefaultsOnInsert: true }
  );

  if (result?.lastErrorObject?.upserted) {
    await Course.updateOne({ _id: courseId }, { $inc: { enrollmentCount: 1 } });
  }
}

module.exports = {
  ensureStripeForCourse,
  createCourseCheckout,
  grantCourseAfterPayment,
  syncFromCheckoutSessionPublic
};
