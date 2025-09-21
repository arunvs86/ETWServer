const { Schema, model, Types } = require('mongoose');
const { baseSlugify } = require('../utils/slugify');

const EbookSchema = new Schema(
  {
    // identity
    title: { type: String, required: true, trim: true },
    slug:  { type: String, required: true, unique: true, index: true },

    // author
    instructorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },

    // catalog
    description: { type: String, default: '' },
    category:    { type: String, default: '' },

    // media
    thumbnail: { type: String, default: '' },

    // pricing (minor units)
    pricing: {
      amountMinor: { type: Number, default: 0, min: 0 },           // 0 = free
      currency:    { type: String, enum: ['GBP','USD','EUR'], default: 'GBP' },
      isFree:      { type: Boolean, default: true },               // recalculated
      includedInMembership: { type: Boolean, default: true },      // members unlock if true
    },

    // lifecycle
    status:      { type: String, enum: ['draft','published','archived'], default: 'draft', index: true },
    publishedAt: { type: Date },
    archivedAt:  { type: Date },

    // Stripe snapshot (optional; kept similar to Resource)
    stripe: {
      productId: { type: String },
      priceId:   { type: String },
    },
  },
  { timestamps: true }
);

EbookSchema.pre('validate', function(next) {
  if (!this.slug && this.title) this.slug = baseSlugify(this.title);
  if (this.pricing) this.pricing.isFree = (this.pricing.amountMinor || 0) === 0;
  next();
});

EbookSchema.index({ title: 'text', description: 'text' });
EbookSchema.index(
  { publishedAt: -1, _id: -1 },
  { name: 'pub_newest', partialFilterExpression: { status: 'published' } }
);
EbookSchema.index(
  { category: 1, publishedAt: -1 },
  { name: 'pub_filters', partialFilterExpression: { status: 'published' } }
);

module.exports = model('Ebook', EbookSchema);
