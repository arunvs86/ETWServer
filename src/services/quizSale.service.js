const Stripe = require('stripe');
const { Types } = require('mongoose');
const Quiz = require('../models/Quiz');
const Order = require('../models/Order');
const Membership = require('../models/Membership');

const STRIPE_SK = process.env.STRIPE_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const stripe = STRIPE_SK ? new Stripe(STRIPE_SK, { apiVersion: '2024-06-20' }) : null;

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const toStripeCurrency = (c) => String(c || 'GBP').toLowerCase();

async function ensureStripeForQuiz(quizId) {
  const quiz = await Quiz.findById(quizId);
  if (!quiz) throw httpError(404, 'Quiz not found');
  if (!stripe) throw httpError(500, 'Stripe not configured');

  const isFree = !!quiz.pricing?.isFree;
  if (isFree) return quiz;

  // 1) product
  if (!quiz.stripe?.productId) {
    const product = await stripe.products.create({
      name: quiz.title,
      metadata: { quizId: String(quiz._id), slug: quiz.slug || '' },
    });
    quiz.stripe = { ...(quiz.stripe || {}), productId: product.id };
  }

  // 2) price (always create new to match current amount)
  const amount = quiz.pricing?.amountMinor ?? 0;
  const currency = toStripeCurrency(quiz.pricing?.currency || 'GBP');
  const price = await stripe.prices.create({
    currency,
    unit_amount: amount,
    product: quiz.stripe.productId,
    metadata: { quizId: String(quiz._id), slug: quiz.slug || '' },
  });

  quiz.stripe.priceId = price.id;
  await quiz.save();
  return quiz;
}

async function userHasActiveMembership(userId) {
  const mem = await Membership.findOne({ userId }).lean();
  if (!mem) return false;
  const now = new Date();
  return (mem.status === 'active' || mem.status === 'trialing') &&
         now >= mem.currentPeriodStart && now < mem.currentPeriodEnd;
}

async function userHasPurchasedQuiz(userId, quizId) {
  const order = await Order.findOne({
    userId: new Types.ObjectId(String(userId)),
    status: 'paid',
    'items.kind': 'quiz',
    'items.refId': new Types.ObjectId(String(quizId)),
  }).lean();
  return !!order;
}

async function createQuizCheckoutBySlug({ userId, slug }) {
  if (!Types.ObjectId.isValid(userId)) throw httpError(400, 'Invalid user');
  const quiz = await Quiz.findOne({ slug, isPublished: true });
  if (!quiz) throw httpError(404, 'Quiz not found');

  if (quiz.pricing?.isFree) throw httpError(400, 'Quiz is free');
  if (quiz.pricing?.includedInMembership) {
    const ok = await userHasActiveMembership(userId);
    if (ok) throw httpError(400, 'Included in membership');
  }

  // already bought?
  const already = await userHasPurchasedQuiz(userId, quiz._id);
  if (already) throw httpError(400, 'Already purchased');

  if (!stripe) throw httpError(500, 'Stripe not configured');

  const ensured = await ensureStripeForQuiz(quiz._id);

  const successUrl = `${FRONTEND_URL}/quizzes/${quiz.slug}?purchase=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${FRONTEND_URL}/quizzes/${quiz.slug}?purchase=cancel`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: ensured.stripe.priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { type: 'quiz', userId: String(userId), quizId: String(quiz._id) },
  });

  return { checkoutUrl: session.url, sessionId: session.id };
}

async function grantQuizAfterPayment({ userId, quizId, session }) {
  const quiz = await Quiz.findById(quizId);
  if (!quiz) return;

  const amountMinor = session.amount_total ?? session.amount_subtotal ?? (quiz.pricing?.amountMinor || 0);
  const currency = (session.currency || (quiz.pricing?.currency || 'GBP')).toUpperCase();

  const idempotencyKey = String(session.payment_intent || session.id);
  await Order.findOneAndUpdate(
    { idempotencyKey },
    {
      userId,
      items: [{
        kind: 'quiz',
        refId: quiz._id,
        titleSnapshot: quiz.title,
        amountMinor,
        currency,
        metadata: { slug: quiz.slug },
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
}

module.exports = {
  ensureStripeForQuiz,
  createQuizCheckoutBySlug,
  grantQuizAfterPayment,
  userHasActiveMembership,
  userHasPurchasedQuiz,
};
