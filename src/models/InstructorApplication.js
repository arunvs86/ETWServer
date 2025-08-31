const { Schema, model, Types } = require('mongoose');

const AnswersSchema = new Schema({
  displayName: { type: String, required: true, trim: true },
  bio:         { type: String, required: true, trim: true },
  website:     { type: String, default: '' },
  links:       { type: [String], default: [] },       // socials/portfolio
  categories:  { type: [String], default: [] },       // expertise tags
  samples:     { type: [String], default: [] },       // sample content URLs
  agreeTerms:  { type: Boolean, required: true },
}, { _id: false });

const ReviewSchema = new Schema({
  reviewedBy:  { type: Types.ObjectId, ref: 'User' },
  reviewedAt:  { type: Date },
  reason:      { type: String, default: '' }, // for rejection
  notes:       { type: String, default: '' },
}, { _id: false });

const InstructorApplicationSchema = new Schema({
  userId:   { type: Types.ObjectId, ref: 'User', required: true, index: true },
  status:   { type: String, enum: ['pending','approved','rejected'], default: 'pending', index: true },
  answers:  { type: AnswersSchema, required: true },
  review:   { type: ReviewSchema, default: {} },
}, { timestamps: true });

// Only one PENDING application per user
InstructorApplicationSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = model('InstructorApplication', InstructorApplicationSchema);
