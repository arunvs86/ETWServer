const { Schema, model, Types } = require('mongoose');
const { baseSlugify} = require('../utils/slugify');


const StripeInfoSchema = new Schema(
  {
    productId: { type: String },
    priceId:   { type: String }, // current active price used for checkout
  },
  { _id: false }
);

const CourseSchema = new Schema(
  {
    // identity
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true }, // SEO id

    // author
    instructorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },

    // catalog
    subtitle: { type: String, default: '' },
    description: { type: String, default: '' },
    language: { type: String, default: 'en' },
    category: { type: String, default: '' },   // e.g. "ucat", "medicine"
    tags: { type: [String], default: [] },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
      index: true
    },

    // media
    thumbnail: { type: String, default: '' },
    promoVideoUrl: { type: String, default: '' },

    // pricing (minor units = pennies/cents)
    pricing: {
      amountMinor: { type: Number, default: 0, min: 0 }, // e.g., 0 = free, 1299 = £12.99
      currency: { type: String, enum: ['GBP', 'USD', 'EUR'], default: 'GBP' },
      isFree: { type: Boolean, default: true },
      includedInMembership: { type: Boolean, default: true },
    },

    stripe: { type: StripeInfoSchema, default: undefined },

    // publication & lifecycle
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true
    },
    publishedAt: { type: Date },
    archivedAt: { type: Date },

    // aggregates (denormalized for speed)
    ratingAvg: { type: Number, default: 0 },      // 0..5
    ratingCount: { type: Number, default: 0 },
    enrollmentCount: { type: Number, default: 0 },
    totalDurationSec: { type: Number, default: 0 } // sum of lesson durations (optional)
  },
  { timestamps: true }
);

// create slug automatically if missing; keep unique constraint at DB level
CourseSchema.pre('validate', function (next) {
  if (!this.slug && this.title) {
    this.slug = baseSlugify(this.title);
  }
  // maintain isFree flag from amount
  if (this.pricing) {
    this.pricing.isFree = (this.pricing.amountMinor || 0) === 0;
  }
  next();
});

// search index
CourseSchema.index({ title: 'text', description: 'text' });

// Fast paths for public listing queries (only published courses)
CourseSchema.index(
  { publishedAt: -1, _id: -1 },
  { name: 'pub_newest', partialFilterExpression: { status: 'published' } }
);

CourseSchema.index(
  { 'pricing.amountMinor': 1 },
  { name: 'pub_price', partialFilterExpression: { status: 'published' } }
);

CourseSchema.index(
  { ratingAvg: -1, ratingCount: -1 },
  { name: 'pub_rating', partialFilterExpression: { status: 'published' } }
);

CourseSchema.index(
  { enrollmentCount: -1, ratingCount: -1 },
  { name: 'pub_popular', partialFilterExpression: { status: 'published' } }
);

CourseSchema.index(
  { category: 1, level: 1, language: 1, publishedAt: -1 },
  { name: 'pub_catalog_filters', partialFilterExpression: { status: 'published' } }
);


module.exports = model('Course', CourseSchema);
