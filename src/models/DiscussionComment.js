const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const CommentSchema = new Schema({
  questionId: { type: Types.ObjectId, ref: 'DiscussionQuestion', required: true, index: true },
  authorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  body: { type: String, required: true, trim: true, maxlength: 5000 },
  isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true });

CommentSchema.index({ createdAt: 1, questionId: 1 });

module.exports = mongoose.model('DiscussionComment', CommentSchema);
