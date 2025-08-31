require('dotenv').config();
const connectDB = require('../config/db');
const Course = require('../models/Course');
const Section = require('../models/Section');
const Lesson = require('../models/Lesson');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const course = await Course.findOne({ slug: 'ucat-masterclass-2025' });
    if (!course) throw new Error('Course not found. Run smoke-course first.');

    const sections = await Section.find({ courseId: course._id }).sort({ order: 1 });
    if (sections.length < 2) throw new Error('Need at least 2 sections. Run smoke-section first.');
    const [s1, s2] = sections;

    // upsert a video lesson in section 1
    const l1 = await Lesson.findOneAndUpdate(
      { sectionId: s1._id, title: 'Welcome & How to Use This Course' },
      {
        sectionId: s1._id,
        title: 'Welcome & How to Use This Course',
        order: 1,
        type: 'video',
        video: {
          provider: 's3',
          url: 'https://example.com/videos/welcome.mp4', // placeholder
          durationSec: 300,
          captions: [{ lang: 'en', url: 'https://example.com/captions/welcome.vtt' }]
        },
        resources: []
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // upsert a text lesson in section 2
    const l2 = await Lesson.findOneAndUpdate(
      { sectionId: s2._id, title: 'VR: What Examiners Expect' },
      {
        sectionId: s2._id,
        title: 'VR: What Examiners Expect',
        order: 1,
        type: 'text',
        textContent: 'In this lesson we outline the core expectations for UCAT Verbal Reasoning…',
        resources: ['https://example.com/resources/vr-cheatsheet.pdf']
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('🎬 video lesson:', { id: l1._id.toString(), section: s1.title, type: l1.type });
    console.log('📝 text lesson:', { id: l2._id.toString(), section: s2.title, type: l2.type });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-lesson failed:', err.message || err);
    process.exit(1);
  }
})();
