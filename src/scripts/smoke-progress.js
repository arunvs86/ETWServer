require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Course = require('../models/Course');
const Section = require('../models/Section');
const Lesson = require('../models/Lesson');
const Progress = require('../models/Progress');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const [student, course] = await Promise.all([
      User.findOne({ email: 'demo.student@example.com' }),
      Course.findOne({ slug: 'ucat-masterclass-2025' })
    ]);
    if (!student) throw new Error('Demo student not found.');
    if (!course) throw new Error('Demo course not found.');

    // get all lessons in this course (via sections)
    const sections = await Section.find({ courseId: course._id }).select('_id').lean();
    const sectionIds = sections.map(s => s._id);
    const lessons = await Lesson.find({ sectionId: { $in: sectionIds } }).sort({ order: 1 }).lean();

    if (!lessons.length) throw new Error('No lessons found. Run smoke-lesson first.');
    const totalLessons = lessons.length;

    // mark the first lesson complete
    const firstLessonId = lessons[0]._id;
    const lastLessonId = lessons[Math.min(1, lessons.length - 1)]._id; // 2nd lesson or the 1st if only one

    // upsert progress
    let prog = await Progress.findOneAndUpdate(
      { userId: student._id, courseId: course._id },
      {
        userId: student._id,
        courseId: course._id
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // ensure uniqueness of completed lessons locally
    const set = new Set((prog.completedLessonIds || []).map(id => id.toString()));
    set.add(firstLessonId.toString());

    // recompute percent
    const completedCount = set.size;
    const percent = Math.min(100, Math.round((completedCount / totalLessons) * 100));

    prog.completedLessonIds = Array.from(set);
    prog.lastLessonId = lastLessonId;
    prog.percent = percent;
    await prog.save();

    console.log('📈 progress updated:', {
      user: student.email,
      course: course.slug,
      completedCount,
      totalLessons,
      percent: prog.percent
    });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-progress failed:', err.message || err);
    process.exit(1);
  }
})();
