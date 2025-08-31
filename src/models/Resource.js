const { Schema, model, Types } = require('mongoose');
const { baseSlugify } = require('../utils/slugify');

const ResourceSchema = new Schema(
  {
    // identity
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },

    // author
    instructorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },

    // catalog
    description: { type: String, default: '' },
    category: { type: String, default: '' },

    // media
    thumbnail: { type: String, default: '' },

    // pricing (minor units, like pennies)
    pricing: {
      amountMinor: { type: Number, default: 0, min: 0 }, // 0 = free
      currency: { type: String, enum: ['GBP','USD','EUR'], default: 'GBP' },
      isFree: { type: Boolean, default: true }, // recalculated in pre-validate
      includedInMembership: { type: Boolean, default: true }, // members get access if true
    },

    // lifecycle
    status: { type: String, enum: ['draft','published','archived'], default: 'draft', index: true },
    publishedAt: { type: Date },
    archivedAt: { type: Date },
  },
  { timestamps: true }
);

ResourceSchema.pre('validate', function(next) {
  if (!this.slug && this.title) this.slug = baseSlugify(this.title);
  if (this.pricing) this.pricing.isFree = (this.pricing.amountMinor || 0) === 0;
  next();
});

ResourceSchema.index({ title: 'text', description: 'text' });

// public list helpers
ResourceSchema.index(
  { publishedAt: -1, _id: -1 },
  { name: 'pub_newest', partialFilterExpression: { status: 'published' } }
);
ResourceSchema.index(
  { category: 1, publishedAt: -1 },
  { name: 'pub_filters', partialFilterExpression: { status: 'published' } }
);

module.exports = model('Resource', ResourceSchema);
