const { Schema, model, Types } = require('mongoose');

const ResourceAccessSchema = new Schema({
  userId:    { type: Types.ObjectId, ref: 'User', index: true, required: true },
  resourceId:{ type: Types.ObjectId, ref: 'Resource', index: true, required: true },
  via:       { type: String, enum: ['purchase','membership','grant','admin'], default: 'purchase' },
  status:    { type: String, enum: ['active','revoked'], default: 'active' },
  activatedAt:{ type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
}, { timestamps: true });

ResourceAccessSchema.index({ userId: 1, resourceId: 1 }, { unique: true });
module.exports = model('ResourceAccess', ResourceAccessSchema);
