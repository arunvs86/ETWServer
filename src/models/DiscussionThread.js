const { Schema, model, Types } = require('mongoose');

const ContextSchema = new Schema(
  {
    kind: { type: String, enum: ['course', 'lesson'], required: true, index: true },
    id:   { type: Types.ObjectId, required: true, index: true } // Course _id or Lesson _id
  },
  { _id: false }
);

const DiscussionThreadSchema = new Schema(
  {
    context: { type: ContextSchema, required: true },

    title: { type: String, default: '', trim: true },

    visibility: { type: String, enum: ['enrolled', 'public'], default: 'enrolled', index: true },

    createdBy: { type: Types.ObjectId, ref: 'User', required: true, index: true },

    // moderation & UX
    isPinned: { type: Boolean, default: false, index: true },
    isLocked: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date },

    // rollups (updated by post model/service)
    postsCount: { type: Number, default: 0 },
    lastPostAt: { type: Date }
  },
  { timestamps: true }
);

// fast lookups
DiscussionThreadSchema.index({ 'context.kind': 1, 'context.id': 1, isPinned: 1 });
DiscussionThreadSchema.index({ createdBy: 1, 'context.kind': 1 });
DiscussionThreadSchema.index({ lastPostAt: -1 });

// ensure a user can't create duplicate threads with same title in same context (optional but helpful)
DiscussionThreadSchema.index(
  { 'context.kind': 1, 'context.id': 1, title: 1, createdBy: 1 },
  { unique: true, partialFilterExpression: { title: { $type: 'string' } } }
);

module.exports = model('DiscussionThread', DiscussionThreadSchema);
