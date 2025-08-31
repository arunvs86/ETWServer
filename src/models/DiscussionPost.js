const { Schema, model, Types } = require('mongoose');

const AttachmentSchema = new Schema(
  {
    kind: { type: String, enum: ['image', 'file', 'link'], default: 'link' },
    url: { type: String, required: true },
    name: { type: String, default: '' }
  },
  { _id: false }
);

const DiscussionPostSchema = new Schema(
  {
    threadId: { type: Types.ObjectId, ref: 'DiscussionThread', required: true, index: true },
    parentPostId: { type: Types.ObjectId, ref: 'DiscussionPost' }, // null = root post

    authorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },

    body: { type: String, required: true, trim: true },
    attachments: { type: [AttachmentSchema], default: [] },

    // Q&A features
    isAnswer: { type: Boolean, default: false, index: true },          // accepted answer
    isInstructorAnswer: { type: Boolean, default: false },             // convenience flag

    // social
    upvotesCount: { type: Number, default: 0 },

    // moderation
    editedAt: { type: Date },
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Only one accepted answer per thread (DB-level)
DiscussionPostSchema.index(
  { threadId: 1 },
  { unique: true, partialFilterExpression: { isAnswer: true } }
);

// fast queries
DiscussionPostSchema.index({ threadId: 1, createdAt: 1 });
DiscussionPostSchema.index({ parentPostId: 1 });

// rollup helpers (update thread postsCount + lastPostAt)
DiscussionPostSchema.statics.recalcThread = async function (threadId) {
  const DiscussionThread = require('./DiscussionThread');
  const objId = typeof threadId === 'string' ? new Types.ObjectId(threadId) : threadId;

  const [stats] = await this.aggregate([
    { $match: { threadId: objId, deletedAt: { $exists: false } } },
    { $group: { _id: '$threadId', postsCount: { $sum: 1 }, lastPostAt: { $max: '$createdAt' } } }
  ]);

  const update = {
    postsCount: stats ? stats.postsCount : 0,
    lastPostAt: stats ? stats.lastPostAt : null
  };
  await DiscussionThread.findByIdAndUpdate(objId, update, { new: false });
};

DiscussionPostSchema.post('save', async function () {
  await this.constructor.recalcThread(this.threadId);
});
DiscussionPostSchema.post('deleteOne', { document: true, query: false }, async function () {
  await this.constructor.recalcThread(this.threadId);
});

module.exports = model('DiscussionPost', DiscussionPostSchema);
