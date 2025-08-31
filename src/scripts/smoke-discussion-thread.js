require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Course = require('../models/Course');
const Section = require('../models/Section');
const Lesson = require('../models/Lesson');
const DiscussionThread = require('../models/DiscussionThread');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const [student, instructor, course] = await Promise.all([
      User.findOne({ email: 'demo.student@example.com' }),
      User.findOne({ email: 'demo.instructor@example.com' }),
      Course.findOne({ slug: 'ucat-masterclass-2025' })
    ]);
    if (!student || !instructor) throw new Error('Demo users missing. Run smoke-user.');
    if (!course) throw new Error('Demo course missing. Run smoke-course.');

    // grab first lesson
    const sections = await Section.find({ courseId: course._id }).sort({ order: 1 }).select('_id').lean();
    const lessons = await Lesson.find({ sectionId: { $in: sections.map(s => s._id) } }).sort({ order: 1 }).lean();
    if (!lessons.length) throw new Error('No lessons found. Run smoke-lesson.');
    const firstLesson = lessons[0];

    // Course-level "General Q&A" by student
    const t1 = await DiscussionThread.findOneAndUpdate(
      {
        'context.kind': 'course',
        'context.id': course._id,
        title: 'General Q&A'
      },
      {
        context: { kind: 'course', id: course._id },
        title: 'General Q&A',
        createdBy: student._id,
        visibility: 'enrolled',
        isPinned: true
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Lesson-level thread by instructor
    const t2 = await DiscussionThread.findOneAndUpdate(
      {
        'context.kind': 'lesson',
        'context.id': firstLesson._id,
        title: 'Questions about this lesson'
      },
      {
        context: { kind: 'lesson', id: firstLesson._id },
        title: 'Questions about this lesson',
        createdBy: instructor._id,
        visibility: 'enrolled',
        isPinned: false
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('💬 threads upserted:', [
      { id: t1._id.toString(), context: 'course', title: t1.title },
      { id: t2._id.toString(), context: 'lesson', title: t2.title }
    ]);

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-discussion-thread failed:', err.message || err);
    process.exit(1);
  }
})();
