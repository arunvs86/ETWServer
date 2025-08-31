const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const QuestionSchema = new Schema({
  authorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: Types.ObjectId, ref: 'Course', default: null, index: true },

  title: { type: String, required: true, trim: true, maxlength: 180 },
  body: { type: String, required: true, trim: true },

  status: { type: String, enum: ['open', 'answered', 'closed', 'locked'], default: 'open', index: true },
  acceptedAnswerId: { type: Types.ObjectId, ref: 'DiscussionAnswer', default: null },

  viewsCount: { type: Number, default: 0 },
  answersCount: { type: Number, default: 0 },

  upvotes: [{ type: Types.ObjectId, ref: 'User', index: true }],

  isArchived: { type: Boolean, default: false, index: true },
  isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true });

QuestionSchema.index({ createdAt: -1 });
// only text index on title+body now
QuestionSchema.index({ title: 'text', body: 'text' });

module.exports = mongoose.model('DiscussionQuestion', QuestionSchema);
