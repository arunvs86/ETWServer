const { Schema, model, Types } = require('mongoose');

const LinkSchema = new Schema(
  {
    url: { type: String, required: true },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const FileSchema = new Schema(
  {
    url: { type: String, required: true }, // from /uploads
    fileName: { type: String, default: '' },
    size: { type: Number, default: 0 }, // bytes
    mimeType: { type: String, default: '' },
  },
  { _id: false }
);

const ResourceItemSchema = new Schema(
  {
    resourceId: { type: Types.ObjectId, ref: 'Resource', required: true, index: true },
    title: { type: String, required: true, trim: true },
    order: { type: Number, default: 0, index: true },
    type: { type: String, enum: ['link', 'file'], required: true },
    link: { type: LinkSchema, default: undefined },
    file: { type: FileSchema, default: undefined },
    // optional aggregate
    downloadCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ResourceItemSchema.index({ resourceId: 1, order: 1, _id: 1 });

module.exports = model('ResourceItem', ResourceItemSchema);
