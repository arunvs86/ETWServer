// src/services/meCourse.service.js
// Real logic for enrolled course view + single lesson fetch.

const { Types } = require('mongoose');
const Course  = require('../models/Course');   // adjust path if needed
const Section = require('../models/Section');  // uses { courseId, title, order, archivedAt? }
const Lesson  = require('../models/Lesson');   // uses { sectionId, title, order, type, video, textContent, quizId, archivedAt? }
const Enrollment = require('../models/Enrollment');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const isObjId = (v) => Types.ObjectId.isValid(v);

// active now = status:active and (no expiry or expiry in future)
function isEnrollmentActive(enr) {
  if (!enr) return false;
  if (enr.status !== 'active') return false;
  if (enr.expiresAt && enr.expiresAt < new Date()) return false;
  return true;
}

// common filter: hide archived docs whether field missing or null
const notArchived = { $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }] };

function shapeLesson(doc) {
  return {
    id: doc._id,
    sectionId: doc.sectionId,
    title: doc.title,
    order: doc.order,
    type: doc.type,                    // 'video' | 'text' | 'quiz'
    video: doc.type === 'video' ? doc.video : undefined,
    textContent: doc.type === 'text' ? doc.textContent : undefined,
    quizId: doc.type === 'quiz' ? doc.quizId : undefined,
    resources: doc.resources || [],
  };
}

async function getEnrolledCourseBySlug({ userId, slug }) {
  if (!userId) throw httpError(401, 'Auth required');
  if (!slug || typeof slug !== 'string') throw httpError(400, 'Invalid slug');

  // 1) Find course by slug (allow any status except archived; enrolled users may access even if later unpublished)
  const course = await Course.findOne({ slug }).lean();
  if (!course) throw httpError(404, 'Course not found');
  if (course.archivedAt) throw httpError(410, 'Course archived');

  // 2) Must be enrolled & currently active
  const enr = await Enrollment.findOne({ userId, courseId: course._id }).lean();
  if (!isEnrollmentActive(enr)) throw httpError(403, 'Not enrolled');

  // 3) Fetch sections (not archived), ordered
  const sections = await Section.find({ courseId: course._id, ...notArchived })
    .select('_id title order')
    .sort({ order: 1, _id: 1 })
    .lean();

  const sectionIds = sections.map(s => s._id);
  // 4) Fetch lessons for those sections (not archived), ordered
  const lessons = sectionIds.length
    ? await Lesson.find({ sectionId: { $in: sectionIds }, ...notArchived })
        .select('_id sectionId title order type video textContent quizId resources')
        .sort({ sectionId: 1, order: 1, _id: 1 })
        .lean()
    : [];

  // 5) Attach lessons to sections
  const bySection = new Map(sections.map(s => [String(s._id), { id: s._id, title: s.title, order: s.order, lessons: [] }]));
  for (const l of lessons) {
    const key = String(l.sectionId);
    const bucket = bySection.get(key);
    if (bucket) bucket.lessons.push(shapeLesson(l));
  }

  const shapedSections = Array.from(bySection.values());

  // (Progress summary to be wired after progress endpoints; placeholder for now)
  const progress = { percent: 0, completedLessonIds: [] };

  return {
    course: {
      id: course._id,
      title: course.title,
      slug: course.slug,
      subtitle: course.subtitle,
      description: course.description,
      thumbnail: course.thumbnail,
      language: course.language,
      level: course.level,
      category: course.category,
      totalDurationSec: course.totalDurationSec || 0,
      sections: shapedSections,
      progress,
    },
  };
}

async function getLessonById({ userId, lessonId }) {
  if (!userId) throw httpError(401, 'Auth required');
  if (!isObjId(lessonId)) throw httpError(400, 'Invalid lesson id');

  // 1) Find lesson (not archived)
  const lesson = await Lesson.findOne({ _id: lessonId, ...notArchived }).lean();
  if (!lesson) throw httpError(404, 'Lesson not found');

  // 2) Section & Course (not archived)
  const section = await Section.findOne({ _id: lesson.sectionId, ...notArchived }).lean();
  if (!section) throw httpError(404, 'Section not found');

  const course = await Course.findById(section.courseId).lean();
  if (!course || course.archivedAt) throw httpError(410, 'Course archived');

  // 3) Enrolled check
  const enr = await Enrollment.findOne({ userId, courseId: course._id }).lean();
  if (!isEnrollmentActive(enr)) throw httpError(403, 'Not enrolled');

  return {
    lesson: {
      ...shapeLesson(lesson),
      course: { id: course._id, slug: course.slug, title: course.title },
    },
  };
}

module.exports = {
  getEnrolledCourseBySlug,
  getLessonById,
};
