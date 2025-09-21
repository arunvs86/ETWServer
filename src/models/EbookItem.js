const { Schema, model, Types } = require('mongoose');

const LinkSchema = new Schema(
  {
    url:  { type: String, required: true },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const FileSchema = new Schema(
  {
    url:      { type: String, required: true }, // from /uploads or external CDN
    fileName: { type: String, default: '' },
    size:     { type: Number, default: 0 },     // bytes
    mimeType: { type: String, default: '' },
    kind:     { type: String, enum: ['full','sample'], default: 'full' },
  },
  { _id: false }
);

const EbookItemSchema = new Schema(
  {
    ebookId: { type: Types.ObjectId, ref: 'Ebook', required: true, index: true },
    title:   { type: String, required: true, trim: true },
    order:   { type: Number, default: 0, index: true },
    type:    { type: String, enum: ['link','file'], required: true },
    link:    { type: LinkSchema, default: undefined },
    file:    { type: FileSchema, default: undefined },
    downloadCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

EbookItemSchema.index({ ebookId: 1, order: 1, _id: 1 });

module.exports = model('EbookItem', EbookItemSchema);
