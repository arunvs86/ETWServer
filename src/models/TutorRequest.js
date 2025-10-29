// models/TutorRequest.js
const { Schema, model, Types } = require('mongoose');

const TutorRequestSchema = new Schema(
  {
    studentId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },

    subject: { type: String, required: true, trim: true },
    level: { type: String, required: false, trim: true },
    availabilityPref: { type: String, required: false, trim: true },
    urgency: {
      type: String,
      enum: ['urgent', 'soon', 'flexible'],
      default: 'soon',
    },
    notes: { type: String, required: false, trim: true },

    status: {
      type: String,
      enum: ['pending_payment', 'pending', 'matched', 'refunded', 'closed'],
      default: 'pending_payment',
    },

    stripeCheckoutSessionId: { type: String },
    stripePaymentIntentId: { type: String }, // <-- NEW
  },
  {
    timestamps: true,
  }
);

module.exports = model('TutorRequest', TutorRequestSchema);
