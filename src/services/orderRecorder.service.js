// services/orderRecorder.service.js
const Order = require('../models/Order');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

/**
 * Idempotently upserts an Order for a Stripe Checkout session.
 * @param {Object} params
 * @param {string} params.userId
 * @param {Object} params.session  - Stripe checkout session object
 * @param {Array}  params.items    - [{ kind, refId, titleSnapshot, amountMinor, currency, metadata }]
 * @returns {Promise<{order: any, wasPreExisting: boolean}>}
 */
async function recordStripeOrder({ userId, session, items }) {
  if (!userId) throw httpError(400, 'recordStripeOrder: userId required');
  if (!session) throw httpError(400, 'recordStripeOrder: session required');
  if (!Array.isArray(items) || !items.length) throw httpError(400, 'recordStripeOrder: items required');

  const idempotencyKey = String(session.payment_intent || session.id);
  const pre = await Order.findOne({ idempotencyKey }).select('_id').lean();

  const totalAmountMinor = items.reduce((sum, it) => sum + (Number(it.amountMinor || 0) || 0), 0);
  const currency = (items[0].currency || session.currency || 'GBP').toUpperCase();

  const order = await Order.findOneAndUpdate(
    { idempotencyKey },
    {
      userId,
      items,
      totalAmountMinor,
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

  return { order, wasPreExisting: !!pre };
}

module.exports = { recordStripeOrder };
