// models/LiveSessionAccess.js
const { Schema, model, Types } = require('mongoose');

const LiveSessionAccessSchema = new Schema(
  {
    userId:    { type: Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: Types.ObjectId, ref: 'LiveSession', required: true, index: true },
    source:    { type: String, enum: ['purchase','membership','admin'], default: 'purchase' },
    orderId:   { type: String },
    notes:     { type: String },
  },
  { timestamps: true, collection: 'live_session_access' }
);

LiveSessionAccessSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

module.exports = model('LiveSessionAccess', LiveSessionAccessSchema);
