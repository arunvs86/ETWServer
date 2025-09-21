const { Schema, model, Types } = require('mongoose');

const EbookAccessSchema = new Schema({
  userId:   { type: Types.ObjectId, ref: 'User', index: true, required: true },
  ebookId:  { type: Types.ObjectId, ref: 'Ebook', index: true, required: true },
  via:      { type: String, enum: ['purchase','membership','grant','admin'], default: 'purchase' },
  status:   { type: String, enum: ['active','revoked'], default: 'active' },
  activatedAt: { type: Date, default: Date.now },
  expiresAt:   { type: Date, default: null },
}, { timestamps: true });

EbookAccessSchema.index({ userId: 1, ebookId: 1 }, { unique: true });

module.exports = model('EbookAccess', EbookAccessSchema);
