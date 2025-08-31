require('dotenv').config();
const connectDB = require('../config/db');
const Course = require('../models/Course');
const Section = require('../models/Section');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    // find the course we created in the previous step
    const course = await Course.findOne({ slug: 'ucat-masterclass-2025' });
    if (!course) throw new Error('Course not found. Run smoke-course first.');

    const sections = [
      { title: 'Introduction & Strategy Overview', order: 1 },
      { title: 'Verbal Reasoning Fundamentals', order: 2 }
    ];

    for (const s of sections) {
      const doc = await Section.findOneAndUpdate(
        { courseId: course._id, title: s.title },
        { courseId: course._id, title: s.title, order: s.order },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log('📚 section upserted:', {
        id: doc._id.toString(),
        course: course.slug,
        title: doc.title,
        order: doc.order
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-section failed:', err);
    process.exit(1);
  }
})();
