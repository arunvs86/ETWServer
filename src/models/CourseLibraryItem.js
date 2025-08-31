const { Schema, model, Types } = require('mongoose');

const CourseLibraryItemSchema = new Schema(
  {
    userId:   { type: Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Types.ObjectId, ref: 'Course', required: true, index: true },

    savedAt:      { type: Date },         // set when user hits "Save"
    archivedAt:   { type: Date },         // hide from default views
    lastViewedAt: { type: Date },
    pinned:       { type: Boolean, default: false }
  },
  { timestamps: true }
);

// one record per user+course
CourseLibraryItemSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = model('CourseLibraryItem', CourseLibraryItemSchema);
