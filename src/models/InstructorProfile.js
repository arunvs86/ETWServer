const { Schema, model, Types } = require('mongoose');

const SocialsSchema = new Schema(
  {
    linkedin: { type: String, default: '' },
    twitter:  { type: String, default: '' },
    youtube:  { type: String, default: '' },
    website:  { type: String, default: '' }
  },
  { _id: false }
);

const InstructorProfileSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    headline: { type: String, default: '', trim: true },
    bio: { type: String, default: '' },
    socials: { type: SocialsSchema, default: () => ({}) },
    credentials: { type: [String], default: [] },

    // aggregates (denormalized)
    ratingAvg: { type: Number, default: 0 },       // weighted across courses
    ratingCount: { type: Number, default: 0 },     // total # of reviews across courses
    studentsTaughtCount: { type: Number, default: 0 }, // distinct enrolled students
    coursesCount: { type: Number, default: 0 }     // published courses only
  },
  { timestamps: true }
);

// hide internals
const hideSensitive = (_, ret) => { delete ret.__v; return ret; };
InstructorProfileSchema.set('toJSON', { transform: hideSensitive });
InstructorProfileSchema.set('toObject', { transform: hideSensitive });

/**
 * Recompute aggregates from Course + Enrollment.
 * ratingAvg = weighted avg of course.ratingAvg by course.ratingCount (published courses only)
 */
InstructorProfileSchema.statics.recalcAggregatesFor = async function (instructorUserId) {
  const Course = require('./Course');
  const Enrollment = require('./Enrollment');

  const instId = typeof instructorUserId === 'string'
    ? new Types.ObjectId(instructorUserId)
    : instructorUserId;

  // published courses by this instructor
  const courses = await Course.find({ instructorId: instId, status: 'published' })
    .select('_id ratingAvg ratingCount')
    .lean();

  const coursesCount = courses.length;

  // weighted rating
  let totalWeight = 0;
  let weightedSum = 0;
  for (const c of courses) {
    if (c.ratingCount > 0 && c.ratingAvg > 0) {
      totalWeight += c.ratingCount;
      weightedSum += c.ratingAvg * c.ratingCount;
    }
  }
  const ratingAvg = totalWeight ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;
  const ratingCount = totalWeight;

  // distinct students across these courses (active enrollments)
  let studentsTaughtCount = 0;
  if (coursesCount > 0) {
    const courseIds = courses.map(c => c._id);
    const distinct = await Enrollment.distinct('userId', {
      courseId: { $in: courseIds },
      status: 'active'
    });
    studentsTaughtCount = distinct.length;
  }

  // upsert the profile with new aggregates
  const update = {
    ratingAvg,
    ratingCount,
    studentsTaughtCount,
    coursesCount
  };
  await this.findOneAndUpdate(
    { userId: instId },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return update;
};

module.exports = model('InstructorProfile', InstructorProfileSchema);
