const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const AnswerSchema = new Schema({
  questionId: { type: Types.ObjectId, ref: 'DiscussionQuestion', required: true, index: true },
  authorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },

  body: { type: String, required: true, trim: true },

  isAccepted: { type: Boolean, default: false, index: true },
  upvotes: [{ type: Types.ObjectId, ref: 'User', index: true }],

  isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true });

AnswerSchema.index({ createdAt: 1, questionId: 1 });

AnswerSchema.methods.canEdit = function (user) {
  if (!user) return false;
  return String(this.authorId) === String(user.id || user._id) || ['admin'].includes(user.role);
};

AnswerSchema.methods.toggleUpvote = function (userId) {
  const id = String(userId);
  const i = this.upvotes.findIndex(u => String(u) === id);
  if (i >= 0) this.upvotes.splice(i, 1); else this.upvotes.push(userId);
  return this.save();
};

module.exports = mongoose.model('DiscussionAnswer', AnswerSchema);
