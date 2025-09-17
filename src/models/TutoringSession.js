// models/TutoringSession.js
const { Schema, model, Types } = require('mongoose');

const CancelRequestSchema = new Schema({
  requestedBy: { type: Types.ObjectId, ref: 'User' },
  reason:      { type: String, default: '', maxlength: 500 },
  requestedAt: { type: Date },
  approvedAt:  { type: Date },
  approvedBy:  { type: Types.ObjectId, ref: 'User' }
}, { _id: false });

const TutoringSessionSchema = new Schema({
  tutorId:   { type: Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: Types.ObjectId, ref: 'User', required: true, index: true },

  startAt:   { type: Date, required: true, index: true },
  endAt:     { type: Date, required: true },

  currency:     { type: String, default: 'GBP' },
  amountMinor:  { type: Number, required: true, min: 0 },

  stripeCheckoutSessionId: { type: String, index: true },
  stripePaymentIntentId:   { type: String, index: true },

  status: {
    type: String,
    enum: ['hold','payment_pending','confirmed','cancelled','completed','refunded'],
    default: 'hold',
    index: true
  },
  holdExpiresAt: { type: Date },

  meetingLink: { type: String, default: '' },
  notes:       { type: String, default: '' },

  // NEW: cancel workflow
  cancelRequest: { type: CancelRequestSchema, default: undefined }
}, { timestamps: true });

TutoringSessionSchema.index(
  { tutorId: 1, startAt: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['hold','payment_pending','confirmed'] } }
  }
);

module.exports = model('TutoringSession', TutoringSessionSchema);
