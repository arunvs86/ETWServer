const { Schema, model, Types } = require('mongoose');

const CaptionSchema = new Schema(
  {
    lang: { type: String, default: 'en' }, // ISO code
    url: { type: String, required: true }
  },
  { _id: false }
);

const VideoBlockSchema = new Schema(
  {
    provider: { type: String, enum: ['mux', 's3', 'cloudflare','youtube'], default: 's3' },
    assetId: { type: String, default: '' }, // e.g., mux asset id or s3 key
    url: { type: String, default: '' },     // signed or CDN url (optional if using assetId)
    durationSec: { type: Number, default: 0, min: 0 },
    captions: { type: [CaptionSchema], default: [] }
  },
  { _id: false }
);

const LessonSchema = new Schema(
  {
    sectionId: { type: Types.ObjectId, ref: 'Section', required: true, index: true },
    title: { type: String, required: true, trim: true },
    order: { type: Number, default: 0, index: true },

    type: { type: String, enum: ['video', 'text', 'quiz'], default: 'video', index: true },

    // content variants (only one is relevant depending on `type`)
    video: { type: VideoBlockSchema, default: undefined },
    textContent: { type: String, default: '' },
    quizId: { type: Types.ObjectId, ref: 'Quiz' }, // we’ll create Quiz model later

    resources: { type: [String], default: [] }, // URLs
    archivedAt: { type: Date }
  },
  { timestamps: true }
);

// conditional validation by type
LessonSchema.pre('validate', function (next) {
  if (this.type === 'video') {
    if (!this.video || (!this.video.url && !this.video.assetId)) {
      return next(new Error('Video lesson requires video.url or video.assetId'));
    }
  }
  if (this.type === 'text') {
    if (!this.textContent || this.textContent.trim().length === 0) {
      return next(new Error('Text lesson requires textContent'));
    }
  }
  if (this.type === 'quiz') {
    if (!this.quizId) return next(new Error('Quiz lesson requires quizId'));
  }
  next();
});

// helpful compound indexes
LessonSchema.index({ sectionId: 1, order: 1 });

module.exports = model('Lesson', LessonSchema);
