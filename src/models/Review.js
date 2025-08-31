const { Schema, model, Types } = require('mongoose');

const ReviewSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Types.ObjectId, ref: 'Course', required: true, index: true },

    rating: { type: Number, required: true, min: 1, max: 5, index: true },
    comment: { type: String, default: '' },

    isPublished: { type: Boolean, default: true }, // basic moderation switch
    helpfulCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// one review per user per course
ReviewSchema.index({ userId: 1, courseId: 1 }, { unique: true });

// --- aggregates: recompute course.ratingAvg / ratingCount ---
ReviewSchema.statics.recalcCourseAggregates = async function (courseId) {
  const Course = require('./Course'); // require here to avoid circular deps
  const objId = typeof courseId === 'string' ? new Types.ObjectId(courseId) : courseId;

  const [stats] = await this.aggregate([
    { $match: { courseId: objId, isPublished: true } },
    {
      $group: {
        _id: '$courseId',
        ratingAvg: { $avg: '$rating' },
        ratingCount: { $sum: 1 }
      }
    }
  ]);

  const ratingAvg = stats ? Math.round(stats.ratingAvg * 10) / 10 : 0; // one decimal like 4.6
  const ratingCount = stats ? stats.ratingCount : 0;

  await Course.findByIdAndUpdate(objId, { ratingAvg, ratingCount }, { new: false });
};

// doc-level hooks (triggered on .save() / doc.deleteOne())
ReviewSchema.post('save', async function () {
  await this.constructor.recalcCourseAggregates(this.courseId);
});
ReviewSchema.post('deleteOne', { document: true, query: false }, async function () {
  await this.constructor.recalcCourseAggregates(this.courseId);
});

module.exports = model('Review', ReviewSchema);
