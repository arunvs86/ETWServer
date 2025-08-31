const { Schema, model, Types } = require('mongoose');

const OrderItemSchema = new Schema(
  {
    kind: { type: String, enum: ['course', 'membership'], required: true },
    refId: { type: Types.ObjectId },            // Course _id for 'course'; optional for 'membership'
    titleSnapshot: { type: String, required: true }, // capture title/plan at purchase time
    amountMinor: { type: Number, required: true, min: 0 }, // e.g., 1299 = £12.99
    currency: { type: String, enum: ['GBP', 'USD', 'EUR'], default: 'GBP' },
    metadata: { type: Schema.Types.Mixed }       // optional; e.g., { plan: 'exec', period: 'monthly' }
  },
  { _id: false }
);

const StripeInfoSchema = new Schema(
  {
    customerId: { type: String, index: true },
    paymentIntentId: { type: String, index: true },
    chargeId: { type: String, index: true },
    checkoutSessionId: { type: String, index: true }
  },
  { _id: false }
);

const OrderSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },

    items: { type: [OrderItemSchema], validate: v => Array.isArray(v) && v.length > 0 },

    totalAmountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['GBP', 'USD', 'EUR'], default: 'GBP' },

    status: {
      type: String,
      enum: ['created', 'paid', 'refunded', 'failed', 'canceled'],
      default: 'created',
      index: true
    },

    paymentProvider: { type: String, enum: ['stripe'], default: 'stripe', index: true },
    stripe: { type: StripeInfoSchema, default: undefined },

    // for idempotent create/update from webhooks or checkout confirms
    idempotencyKey: { type: String, index: true },
    notes: { type: String, default: '' }
  },
  { timestamps: true }
);

// partial uniques (only enforced when value exists)
OrderSchema.index(
  { 'stripe.paymentIntentId': 1 },
  { unique: true, partialFilterExpression: { 'stripe.paymentIntentId': { $type: 'string' } } }
);
OrderSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

OrderSchema.methods.isPaid = function () {
  return this.status === 'paid';
};

module.exports = model('Order', OrderSchema);
