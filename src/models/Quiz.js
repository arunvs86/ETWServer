// src/models/Quiz.js
const { Schema, model, Types } = require('mongoose');
const { uniqueSlug } = require('../utils/slugify');

const PricingSchema = new Schema(
  {
    isFree: { type: Boolean, default: true },
    includedInMembership: { type: Boolean, default: false },
    amountMinor: { type: Number, default: 0, min: 0 }, // e.g., 299 = £2.99
    currency: { type: String, default: 'GBP' },
  },
  { _id: false }
);

const StripeRefSchema = new Schema(
  {
    productId: { type: String },
    priceId: { type: String },
  },
  { _id: false }
);

const QuizSchema = new Schema(
  {
    ownerId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Types.ObjectId, ref: 'Course', index: true },

    slug: { type: String, required: true, unique: true, index: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // delivery rules
    timeLimitSec: { type: Number, default: 0, min: 0 },
    attemptsAllowed: { type: Number, default: 1, min: 1 },
    passPercent: { type: Number, default: 70, min: 0, max: 100 },
    isPublished: { type: Boolean, default: false, index: true },
    visibility: {
      type: String,
      enum: ['enrolled', 'public'],
      default: 'enrolled',
      index: true
    },

    // pricing / access
    pricing: { type: PricingSchema, default: () => ({}) },

    // optional Stripe product/price refs
    stripe: { type: StripeRefSchema, default: () => ({}) },

    // QoL flags
    shuffleQuestions: { type: Boolean, default: false },
    shuffleOptions: { type: Boolean, default: false },

    // rollups
    questionCount: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },

    // Optional (future metrics)
    attemptCount: { type: Number, default: 0 },
    passCount: { type: Number, default: 0 },
    avgPercent: { type: Number, default: 0, min: 0, max: 100 },

    archivedAt: { type: Date }
  },
  { timestamps: true }
);

// Helpful compound index for discovery lists
QuizSchema.index({ isPublished: 1, visibility: 1, updatedAt: -1 });

// Ensure slug exists and is unique (on create)
QuizSchema.pre('validate', async function ensureSlug(next) {
  try {
    if (!this.slug) {
      const Quiz = this.constructor;
      this.slug = await uniqueSlug(Quiz, this.title, 'quiz');
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Keep avgPercent within bounds if manually updated
QuizSchema.pre('save', function clampAverages(next) {
  if (typeof this.avgPercent === 'number') {
    if (this.avgPercent < 0) this.avgPercent = 0;
    if (this.avgPercent > 100) this.avgPercent = 100;
  }
  // normalize pricing
  if (this.pricing) {
    if (this.pricing.isFree) this.pricing.amountMinor = 0;
    if ((this.pricing.amountMinor || 0) > 0) this.pricing.isFree = false;
    if (!this.pricing.currency) this.pricing.currency = 'GBP';
  }
  next();
});

module.exports = model('Quiz', QuizSchema);
