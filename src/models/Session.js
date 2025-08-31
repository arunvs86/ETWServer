const { Schema, model, Types } = require('mongoose');

const SessionSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true, index: true }, // token id
    refreshHash: { type: String, required: true },                     // hash of the refresh token
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = model('Session', SessionSchema);
