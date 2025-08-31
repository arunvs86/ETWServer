// src/services/progress.service.js
// Real progress logic for your Progress schema:
// - one Progress doc per { userId, courseId }
// - completedLessonIds[] maintained with $addToSet / $pull
// - lastLessonId updated on complete (and cleared if uncompleted last)
// - percent denormalized and recomputed from total active lessons

const { Types } = require('mongoose');
const Course = require('../models/Course');
const Section = require('../models/Section');
const Lesson = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');
const Progress = require('../models/Progress');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const isObjId = (id) => Types.ObjectId.isValid(id);
const notArchived = { $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }] };

function isEnrollmentActive(enr) {
  if (!enr) return false;
  if (enr.status !== 'active') return false;
  if (enr.expiresAt && enr.expiresAt < new Date()) return false;
  return true;
}

async function ensureEnrolled(userId, courseId) {
  const enr = await Enrollment.findOne({ userId, courseId }).lean();
  if (!isEnrollmentActive(enr)) throw httpError(403, 'Not enrolled');
}

async function getLessonSectionCourse(lessonId) {
  if (!isObjId(lessonId)) throw httpError(400, 'Invalid lesson id');

  const lesson = await Lesson.findOne({ _id: lessonId, ...notArchived }).lean();
  if (!lesson) throw httpError(404, 'Lesson not found');

  const section = await Section.findOne({ _id: lesson.sectionId, ...notArchived }).lean();
  if (!section) throw httpError(404, 'Section not found');

  const course = await Course.findOne({ _id: section.courseId }).lean();
  if (!course || course.archivedAt) throw httpError(410, 'Course archived');

  return { lesson, section, course };
}

async function listActiveLessonIds(courseId) {
  const sections = await Section.find({ courseId, ...notArchived }).select('_id').lean();
  if (!sections.length) return [];
  const sectionIds = sections.map(s => s._id);
  const lessons = await Lesson.find({ sectionId: { $in: sectionIds }, ...notArchived })
    .select('_id')
    .lean();
  return lessons.map(l => l._id);
}

function calcPercent(completed, total) {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

/**
 * POST /me/progress/lessons/:lessonId/complete
 */
async function completeLesson({ userId, lessonId }) {
  if (!userId) throw httpError(401, 'Auth required');

  const { lesson, course } = await getLessonSectionCourse(lessonId);
  await ensureEnrolled(userId, course._id);

  // Upsert progress and add lessonId
  const prog = await Progress.findOneAndUpdate(
    { userId, courseId: course._id },
    {
      $setOnInsert: { userId, courseId: course._id, completedLessonIds: [], percent: 0 },
      $addToSet: { completedLessonIds: lesson._id },
      $set: { lastLessonId: lesson._id },
    },
    { upsert: true, new: true }
  );

  // Recompute percent against current active lessons
  const allActiveIds = await listActiveLessonIds(course._id);
  const done = prog.completedLessonIds.filter(id =>
    allActiveIds.some(aid => String(aid) === String(id))
  ).length;
  const percent = calcPercent(done, allActiveIds.length);

  if (prog.percent !== percent) {
    await Progress.updateOne(
      { _id: prog._id },
      { $set: { percent } }
    );
  }

  return {
    ok: true,
    completed: true,
    lessonId: String(lesson._id),
    courseId: String(course._id),
    percent,
    totals: { lessons: allActiveIds.length, completed: done },
    completedLessonIds: prog.completedLessonIds.map(String),
    lastLessonId: String(lesson._id),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * POST /me/progress/lessons/:lessonId/uncomplete
 */
async function uncompleteLesson({ userId, lessonId }) {
  if (!userId) throw httpError(401, 'Auth required');

  const { lesson, course } = await getLessonSectionCourse(lessonId);
  await ensureEnrolled(userId, course._id);

  // Pull the lessonId from completions
  const prog = await Progress.findOneAndUpdate(
    { userId, courseId: course._id },
    { $pull: { completedLessonIds: lesson._id } },
    { new: true }
  );

  // If no progress doc existed, synthesize an empty state
  const completedIds = prog?.completedLessonIds || [];

  // If the removed lesson was the lastLessonId, clear it
  if (prog && String(prog.lastLessonId || '') === String(lesson._id)) {
    await Progress.updateOne({ _id: prog._id }, { $unset: { lastLessonId: 1 } });
  }

  // Recompute percent
  const allActiveIds = await listActiveLessonIds(course._id);
  const done = completedIds.filter(id =>
    allActiveIds.some(aid => String(aid) === String(id))
  ).length;
  const percent = calcPercent(done, allActiveIds.length);

  if (prog) {
    await Progress.updateOne({ _id: prog._id }, { $set: { percent } });
  } else {
    // Optionally create a doc to store percent=0 (not strictly necessary)
    await Progress.updateOne(
      { userId, courseId: course._id },
      { $setOnInsert: { userId, courseId: course._id, completedLessonIds: [], percent: 0 } },
      { upsert: true }
    );
  }

  return {
    ok: true,
    completed: false,
    lessonId: String(lesson._id),
    courseId: String(course._id),
    percent,
    totals: { lessons: allActiveIds.length, completed: done },
    completedLessonIds: completedIds.map(String),
    lastLessonId: prog?.lastLessonId ? String(prog.lastLessonId) : null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * GET /me/courses/:courseId/progress
 */
async function getCourseProgress({ userId, courseId }) {
  if (!userId) throw httpError(401, 'Auth required');
  if (!isObjId(courseId)) throw httpError(400, 'Invalid course id');

  const course = await Course.findById(courseId).lean();
  if (!course || course.archivedAt) throw httpError(410, 'Course archived');

  await ensureEnrolled(userId, course._id);

  const allActiveIds = await listActiveLessonIds(course._id);

  const prog = await Progress.findOne({ userId, courseId: course._id }).lean();

  const completedIds =
    (prog?.completedLessonIds || []).filter(id =>
      allActiveIds.some(aid => String(aid) === String(id))
    );

  const percent = calcPercent(completedIds.length, allActiveIds.length);

  // keep the denormalized percent fresh (best-effort)
  if (prog && prog.percent !== percent) {
    await Progress.updateOne({ _id: prog._id }, { $set: { percent } });
  }

  return {
    courseId: String(course._id),
    percent,
    completedLessonIds: completedIds.map(String),
    totals: { lessons: allActiveIds.length, completed: completedIds.length },
    lastLessonId: prog?.lastLessonId ? String(prog.lastLessonId) : null,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = { completeLesson, uncompleteLesson, getCourseProgress };
