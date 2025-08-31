const { Schema, model, Types } = require('mongoose');

const ProgressSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Types.ObjectId, ref: 'Course', required: true, index: true },

    // track which lessons are done
    completedLessonIds: { type: [Types.ObjectId], ref: 'Lesson', default: [] },

    // for resume UX
    lastLessonId: { type: Types.ObjectId, ref: 'Lesson' },

    // denormalized; update from service when marking complete
    percent: { type: Number, default: 0, min: 0, max: 100 }
  },
  { timestamps: true }
);

// one progress doc per user+course
ProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = model('Progress', ProgressSchema);
