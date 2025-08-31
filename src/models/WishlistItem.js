const { Schema, model, Types } = require('mongoose');

const WishlistItemSchema = new Schema(
  {
    userId:   { type: Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Types.ObjectId, ref: 'Course', required: true, index: true },
    addedAt:  { type: Date, default: () => new Date(), index: true },
    source:   { type: String, default: 'catalog' } // optional: where it came from
  },
  { timestamps: true }
);

// unique per user+course
WishlistItemSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = model('WishlistItem', WishlistItemSchema);
