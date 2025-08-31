const { Schema, model, Types } = require('mongoose');

const PostVoteSchema = new Schema(
  {
    postId: { type: Types.ObjectId, ref: 'DiscussionPost', required: true, index: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    value:  { type: Number, enum: [1], default: 1 } // upvote only for now
  },
  { timestamps: true }
);

// one vote per user per post
PostVoteSchema.index({ postId: 1, userId: 1 }, { unique: true });

// recalc helper
PostVoteSchema.statics.recalcForPost = async function (postId) {
  const DiscussionPost = require('./DiscussionPost');
  const objId = typeof postId === 'string' ? new Types.ObjectId(postId) : postId;

  const [stats] = await this.aggregate([
    { $match: { postId: objId } },
    { $group: { _id: '$postId', upvotesCount: { $sum: '$value' } } }
  ]);

  const upvotesCount = stats ? stats.upvotesCount : 0;
  await DiscussionPost.findByIdAndUpdate(objId, { upvotesCount }, { new: false });
};

PostVoteSchema.post('save', async function () {
  await this.constructor.recalcForPost(this.postId);
});
PostVoteSchema.post('deleteOne', { document: true, query: false }, async function () {
  await this.constructor.recalcForPost(this.postId);
});

module.exports = model('PostVote', PostVoteSchema);
