// server/routes/learn.routes.js
const express = require('express');
const router = express.Router();

// ⬇️ ADJUST these paths to your actual model files
const Course = require('../models/Course');
const Section = require('../models/Section')
const Lesson = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');
// Optional progress model; if you already have one, swap it in or remove progress entirely
let CourseProgress;
try { CourseProgress = require('../models/courseProgress.model'); } catch { CourseProgress = null; }

// GET /learn/courses/:slug/player
// Returns: { course, access, sections: [{...lessons}], progress: { done: { [lessonId]: true } } }
router.get('/courses/:slug/player', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const userId = req.user?._id || req.user?.id; // devAuth sets req.user

    // 1) Course + access
    const course = await Course.findOne({ slug }).lean();
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // gate: allow if free OR owner OR enrolled (you can also add membership here)
    const isOwner = String(course.instructorId) === String(userId);
    const isFree = !!course.pricing?.isFree;
    const enrolled = await Enrollment.findOne({ userId, courseId: course._id }).lean();

    const accessOk = isFree || isOwner || !!enrolled;
    if (!accessOk) {
      return res.status(403).json({
        access: { ok: false, reason: 'not_enrolled' },
        course: { id: String(course._id), title: course.title, slug: course.slug, pricing: course.pricing, status: course.status }
      });
    }

    // 2) Sections + lessons
    const sections = await Section.find({ courseId: course._id }).sort({ order: 1, createdAt: 1 }).lean();
    const sectionIds = sections.map(s => s._id);
    const lessons = await Lesson.find({ sectionId: { $in: sectionIds } }).sort({ order: 1, createdAt: 1 }).lean();

    const lessonsBySection = new Map();
    for (const s of sections) lessonsBySection.set(String(s._id), []);
    for (const l of lessons) {
      const list = lessonsBySection.get(String(l.sectionId)) || [];
      list.push({
        id: String(l._id),
        sectionId: String(l.sectionId),
        title: l.title,
        order: l.order,
        type: l.type,
        video: l.video || null,
        textContent: l.textContent || '',
        quizId: l.quizId ? String(l.quizId) : null,
        resources: l.resources || []
      });
      lessonsBySection.set(String(l.sectionId), list);
    }

    const payloadSections = sections.map(s => ({
      id: String(s._id),
      courseId: String(s.courseId),
      title: s.title,
      order: s.order,
      lessons: lessonsBySection.get(String(s._id)) || []
    }));

    // 3) Progress (optional, best-effort)
    let done = {};
    if (CourseProgress) {
      const prog = await CourseProgress.findOne({ userId, courseId: course._id }).lean();
      if (prog?.done) done = prog.done; // { [lessonId]: true }
    }

    return res.json({
      course: {
        id: String(course._id),
        title: course.title,
        slug: course.slug,
        thumbnail: course.thumbnail,
        pricing: course.pricing,
        status: course.status,
      },
      access: { ok: true },
      sections: payloadSections,
      progress: { done }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
