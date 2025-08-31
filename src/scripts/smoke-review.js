require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Course = require('../models/Course');
const Review = require('../models/Review');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const [student, course] = await Promise.all([
      User.findOne({ email: 'demo.student@example.com' }),
      Course.findOne({ slug: 'ucat-masterclass-2025' })
    ]);
    if (!student) throw new Error('Demo student not found. Run smoke-user.');
    if (!course) throw new Error('Demo course not found. Run smoke-course.');

    // upsert one review (idempotent)
    const doc = await Review.findOneAndUpdate(
      { userId: student._id, courseId: course._id },
      {
        userId: student._id,
        courseId: course._id,
        rating: 5,
        comment: 'Excellent structure and clear explanations!'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // recalc aggregates (explicit call since we used findOneAndUpdate)
    await Review.recalcCourseAggregates(course._id);

    const updated = await Course.findById(course._id).lean();
    console.log('⭐ review saved:', { id: doc._id.toString(), rating: doc.rating });
    console.log('📊 course aggregates:', {
      ratingAvg: updated.ratingAvg,
      ratingCount: updated.ratingCount
    });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-review failed:', err.message || err);
    process.exit(1);
  }
})();
