// const { Schema, model, Types } = require('mongoose');

// const ProviderStripeSchema = new Schema(
//   {
//     customerId: { type: String, index: true },
//     subscriptionId: { type: String, index: true },
//     priceId: { type: String },
//     latestInvoiceId: { type: String }
//   },
//   { _id: false }
// );

// const MembershipSchema = new Schema(
//   {
//     userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },

//     // simple, explicit plans (adjust later if you rename tiers)
//     plan: { type: String, enum: ['free', 'pro', 'exec','lifetime'], default: 'lifetime', index: true },

//     // lifecycle mirrors Stripe states
//     status: {
//       type: String,
//       enum: ['trialing', 'active', 'past_due', 'canceled', 'incomplete'],
//       default: 'active',
//       index: true
//     },

//     // billing window
//     currentPeriodStart: { type: Date, required: true },
//     currentPeriodEnd: { type: Date, required: true },
//     cancelAtPeriodEnd: { type: Boolean, default: false },

//     // provider info (Stripe first)
//     provider: { type: String, enum: ['stripe'], default: 'stripe', index: true },
//     stripe: { type: ProviderStripeSchema, default: undefined },

//     // housekeeping
//     notes: { type: String, default: '' }
//   },
//   { timestamps: true }
// );

// // one ACTIVE membership per user (DB-level)
// MembershipSchema.index(
//   { userId: 1 },
//   {
//     unique: true,
//     partialFilterExpression: { status: 'active' }
//   }
// );

// // helper: is membership active right now?
// MembershipSchema.methods.isActiveNow = function (at = new Date()) {
//   if (this.status !== 'active' && this.status !== 'trialing') return false;
//   return at >= this.currentPeriodStart && at < this.currentPeriodEnd;
// };

// module.exports = model('Membership', MembershipSchema);


const { Schema, model, Types } = require('mongoose');

const ProviderStripeSchema = new Schema(
  {
    customerId: { type: String, index: true },
    subscriptionId: { type: String, index: true },
    priceId: { type: String },
    latestInvoiceId: { type: String }
  },
  { _id: false }
);

const MembershipSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },

    // explicit plans
    plan: { type: String, enum: ['yearly', 'lifetime'], index: true },

    // lifecycle mirrors Stripe states (subset for Option A)
    status: {
      type: String,
      enum: ['trialing', 'active', 'past_due', 'canceled', 'incomplete'],
      default: 'active',
      index: true
    },

    // billing window
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },

    // provider info (Stripe first)
    provider: { type: String, enum: ['stripe'], default: 'stripe', index: true },
    stripe: { type: ProviderStripeSchema, default: undefined },

    // housekeeping
    notes: { type: String, default: '' }
  },
  { timestamps: true }
);

// one ACTIVE membership per user (DB-level)
MembershipSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' }
  }
);

// helper: is membership active right now?
MembershipSchema.methods.isActiveNow = function (at = new Date()) {
  if (this.status !== 'active' && this.status !== 'trialing') return false;
  return at >= this.currentPeriodStart && at < this.currentPeriodEnd;
};

module.exports = model('Membership', MembershipSchema);
