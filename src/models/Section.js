const { Schema, model, Types } = require('mongoose');

const SectionSchema = new Schema(
  {
    courseId: { type: Types.ObjectId, ref: 'Course', required: true, index: true },
    title: { type: String, required: true, trim: true },
    order: { type: Number, default: 0, index: true }, // display order within the course
    archivedAt: { type: Date } // soft hide without deleting
  },
  { timestamps: true }
);

// prevent duplicate section titles within the same course if you want stricter UX
SectionSchema.index({ courseId: 1, title: 1 }, { unique: false });
// fast sort within course
SectionSchema.index({ courseId: 1, order: 1 });

module.exports = model('Section', SectionSchema);
