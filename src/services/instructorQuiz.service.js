// // src/services/instructorQuiz.service.js
// const { Types } = require('mongoose');
// const Course = require('../models/Course');
// const Quiz = require('../models/Quiz');
// const QuizAttempt = require('../models/QuizAttempt');

// function httpError(status, message) {
//   const e = new Error(message);
//   e.status = status;
//   return e;
// }

// const isObjId = (v) => Types.ObjectId.isValid(v);
// const toInt = (v, def = 0) =>
//   (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def);

// function shapeQuiz(q) {
//   if (!q) return null;
//   return {
//     id: q._id,
//     ownerId: q.ownerId,
//     courseId: q.courseId || null,
//     slug: q.slug,
//     title: q.title,
//     description: q.description,
//     timeLimitSec: q.timeLimitSec,
//     attemptsAllowed: q.attemptsAllowed,
//     passPercent: q.passPercent,
//     isPublished: q.isPublished,
//     visibility: q.visibility, // 'public' | 'enrolled' (logged-in only for standalone MVP)
//     shuffleQuestions: !!q.shuffleQuestions,
//     shuffleOptions: !!q.shuffleOptions,
//     questionCount: q.questionCount,
//     totalPoints: q.totalPoints,
//     attemptCount: q.attemptCount ?? 0,
//     passCount: q.passCount ?? 0,
//     avgPercent: q.avgPercent ?? 0,
//     archivedAt: q.archivedAt || null,
//     createdAt: q.createdAt,
//     updatedAt: q.updatedAt,
//   };
// }

// async function ensureInstructorOwnsCourse(courseId, instructorId, isAdmin = false) {
//   if (!isObjId(courseId)) throw httpError(400, 'Invalid course id');
//   const course = await Course.findById(courseId).lean();
//   if (!course) throw httpError(404, 'Course not found');
//   if (!isAdmin && String(course.instructorId) !== String(instructorId)) {
//     throw httpError(403, 'Not allowed (course does not belong to you)');
//   }
//   if (course.status === 'archived') throw httpError(400, 'Course is archived');
//   return course;
// }

// async function getQuizOrThrow(quizId) {
//   if (!isObjId(quizId)) throw httpError(400, 'Invalid quiz id');
//   const quiz = await Quiz.findById(quizId);
//   if (!quiz) throw httpError(404, 'Quiz not found');
//   return quiz;
// }

// function canManageQuiz(quizDoc, instructorId, isAdmin = false) {
//   if (isAdmin) return true;
//   return String(quizDoc.ownerId) === String(instructorId);
// }

// /** pick allowed basic fields for create/update */
// function pickBasics(payload = {}) {
//   const out = {};
//   if (payload.title != null) out.title = String(payload.title).trim();
//   if (payload.description != null) out.description = String(payload.description);

//   if (payload.visibility && ['enrolled', 'public'].includes(payload.visibility)) {
//     out.visibility = payload.visibility;
//   }

//   if (payload.timeLimitSec != null) {
//     const n = toInt(payload.timeLimitSec, 0);
//     if (n < 0) throw httpError(400, 'timeLimitSec must be >= 0');
//     out.timeLimitSec = n;
//   }
//   if (payload.attemptsAllowed != null) {
//     const n = toInt(payload.attemptsAllowed, 1);
//     if (n < 1) throw httpError(400, 'attemptsAllowed must be >= 1');
//     out.attemptsAllowed = n;
//   }
//   if (payload.passPercent != null) {
//     const n = toInt(payload.passPercent, 70);
//     if (n < 0 || n > 100) throw httpError(400, 'passPercent must be 0..100');
//     out.passPercent = n;
//   }

//   if (payload.shuffleQuestions != null) {
//     out.shuffleQuestions = !!payload.shuffleQuestions;
//   }
//   if (payload.shuffleOptions != null) {
//     out.shuffleOptions = !!payload.shuffleOptions;
//   }

//   return out;
// }

// // ---------- CREATE ----------
// async function createQuiz({ instructorId, isAdmin = false, payload }) {
//   if (!instructorId) throw httpError(401, 'Auth required');

//   // ownerId is the authenticated instructor; admins can also create but ownerId still set to their id
//   const ownerId = instructorId;

//   // Optional course linkage (standalone allowed)
//   let courseId = null;
//   if (payload?.courseId) {
//     const c = await ensureInstructorOwnsCourse(payload.courseId, instructorId, isAdmin);
//     courseId = c._id;
//   }

//   const basics = pickBasics(payload);
//   if (!basics.title) throw httpError(400, 'Title is required');
//   if (!basics.visibility) basics.visibility = 'enrolled'; // default = require login

//   const quiz = await Quiz.create({
//     ownerId,
//     courseId,
//     ...basics,
//     isPublished: false,
//     archivedAt: null,
//   });

//   return { quiz: shapeQuiz(quiz) };
// }

// // ---------- UPDATE ----------
// async function updateQuizBasics({ instructorId, isAdmin = false, quizId, payload }) {
//   const quiz = await getQuizOrThrow(quizId);
//   if (!canManageQuiz(quiz, instructorId, isAdmin)) throw httpError(403, 'Not allowed');
//   if (quiz.archivedAt) throw httpError(400, 'Cannot edit an archived quiz');

//   const updates = pickBasics(payload);
//   if (Object.keys(updates).length === 0) {
//     const fresh = await Quiz.findById(quizId).lean();
//     return { quiz: shapeQuiz(fresh), updated: false };
//   }

//   const doc = await Quiz.findByIdAndUpdate(quizId, updates, { new: true, runValidators: true });
//   return { quiz: shapeQuiz(doc), updated: true };
// }

// // ---------- PUBLISH / UNPUBLISH ----------
// async function publishQuiz({ instructorId, isAdmin = false, quizId }) {
//   const quiz = await getQuizOrThrow(quizId);
//   if (!canManageQuiz(quiz, instructorId, isAdmin)) throw httpError(403, 'Not allowed');
//   if (quiz.archivedAt) throw httpError(400, 'Cannot publish an archived quiz');

//   // Minimum sanity before publish
//   if (!quiz.title) throw httpError(400, 'Title required');
//   if (quiz.attemptsAllowed < 1) throw httpError(400, 'attemptsAllowed must be >= 1');
//   if (quiz.passPercent < 0 || quiz.passPercent > 100) throw httpError(400, 'passPercent must be 0..100');
//   if ((quiz.questionCount || 0) < 1) throw httpError(400, 'Add at least one question');
//   if ((quiz.totalPoints || 0) < 1) throw httpError(400, 'Total points must be >= 1');

//   const updated = await Quiz.findByIdAndUpdate(quizId, { isPublished: true }, { new: true });
//   return { ok: true, quiz: shapeQuiz(updated) };
// }

// async function unpublishQuiz({ instructorId, isAdmin = false, quizId }) {
//   const quiz = await getQuizOrThrow(quizId);
//   if (!canManageQuiz(quiz, instructorId, isAdmin)) throw httpError(403, 'Not allowed');

//   const updated = await Quiz.findByIdAndUpdate(quizId, { isPublished: false }, { new: true });
//   return { ok: true, quiz: shapeQuiz(updated) };
// }

// // ---------- DELETE ----------
// async function deleteQuiz({ instructorId, isAdmin = false, quizId }) {
//   const quiz = await getQuizOrThrow(quizId);
//   if (!canManageQuiz(quiz, instructorId, isAdmin)) throw httpError(403, 'Not allowed');
//   if (quiz.isPublished) throw httpError(400, 'Only unpublished quizzes can be deleted');

//   const attempts = await QuizAttempt.countDocuments({ quizId });
//   if (attempts > 0) throw httpError(400, 'Cannot delete a quiz that has attempts');

//   await Quiz.deleteOne({ _id: quizId });
//   return { deleted: true };
// }

// // ---------- LIST / GET ----------
// async function listMyQuizzes({ instructorId, isAdmin = false, courseId, q, page = 1, limit = 12 }) {
//   if (!instructorId) throw httpError(401, 'Auth required');
//   page = Math.max(1, Number(page) || 1);
//   limit = Math.min(50, Math.max(1, Number(limit) || 12));
//   const skip = (page - 1) * limit;

//   const query = { ownerId: instructorId };

//   // optional: narrow to a specific course I own
//   if (courseId) {
//     const c = await ensureInstructorOwnsCourse(courseId, instructorId, isAdmin);
//     query.courseId = c._id;
//   }

//   if (q && String(q).trim()) {
//     const s = String(q).trim();
//     query.$or = [
//       { title: { $regex: s, $options: 'i' } },
//       { description: { $regex: s, $options: 'i' } },
//     ];
//   }

//   const [items, total] = await Promise.all([
//     Quiz.find(query).sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit),
//     Quiz.countDocuments(query),
//   ]);

//   return {
//     items: items.map(shapeQuiz),
//     meta: { page, limit, total, hasNextPage: page * limit < total },
//   };
// }

// async function getMyQuiz({ instructorId, isAdmin = false, quizId }) {
//   const quiz = await getQuizOrThrow(quizId);
//   if (!canManageQuiz(quiz, instructorId, isAdmin)) throw httpError(403, 'Not allowed');
//   return { quiz: shapeQuiz(quiz) };
// }

// module.exports = {
//   createQuiz,
//   updateQuizBasics,
//   publishQuiz,
//   unpublishQuiz,
//   deleteQuiz,
//   listMyQuizzes,
//   getMyQuiz,
// };


// src/services/instructorQuiz.service.js
const { Types } = require('mongoose');
const Course = require('../models/Course');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const isObjId = (v) => Types.ObjectId.isValid(v);
const toInt = (v, def = 0) =>
  (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def);

function shapeQuiz(q) {
  if (!q) return null;
  return {
    id: q._id,
    ownerId: q.ownerId,
    courseId: q.courseId || null,
    slug: q.slug,
    title: q.title,
    description: q.description,
    timeLimitSec: q.timeLimitSec,
    attemptsAllowed: q.attemptsAllowed,
    passPercent: q.passPercent,
    isPublished: q.isPublished,
    visibility: q.visibility,
    shuffleQuestions: !!q.shuffleQuestions,
    shuffleOptions: !!q.shuffleOptions,
    questionCount: q.questionCount,
    totalPoints: q.totalPoints,
    attemptCount: q.attemptCount ?? 0,
    passCount: q.passCount ?? 0,
    avgPercent: q.avgPercent ?? 0,
    pricing: {
      isFree: q.pricing?.isFree ?? true,
      includedInMembership: q.pricing?.includedInMembership ?? false,
      amountMinor: q.pricing?.amountMinor ?? 0,
      currency: q.pricing?.currency ?? 'GBP',
    },
    archivedAt: q.archivedAt || null,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

async function ensureInstructorOwnsCourse(courseId, instructorId, isAdmin = false) {
  if (!isObjId(courseId)) throw httpError(400, 'Invalid course id');
  const course = await Course.findById(courseId).lean();
  if (!course) throw httpError(404, 'Course not found');
  if (!isAdmin && String(course.instructorId) !== String(instructorId)) {
    throw httpError(403, 'Not allowed (course does not belong to you)');
  }
  if (course.status === 'archived') throw httpError(400, 'Course is archived');
  return course;
}

async function getQuizOrThrow(quizId) {
  if (!isObjId(quizId)) throw httpError(400, 'Invalid quiz id');
  const quiz = await Quiz.findById(quizId);
  if (!quiz) throw httpError(404, 'Quiz not found');
  return quiz;
}

function canManageQuiz(quizDoc, instructorId, isAdmin = false) {
  if (isAdmin) return true;
  return String(quizDoc.ownerId) === String(instructorId);
}

/** pick allowed basic fields for create/update */
function pickBasics(payload = {}) {
  const out = {};
  if (payload.title != null) out.title = String(payload.title).trim();
  if (payload.description != null) out.description = String(payload.description);

  if (payload.visibility && ['enrolled', 'public'].includes(payload.visibility)) {
    out.visibility = payload.visibility;
  }

  if (payload.timeLimitSec != null) {
    const n = toInt(payload.timeLimitSec, 0);
    if (n < 0) throw httpError(400, 'timeLimitSec must be >= 0');
    out.timeLimitSec = n;
  }
  if (payload.attemptsAllowed != null) {
    const n = toInt(payload.attemptsAllowed, 1);
    if (n < 1) throw httpError(400, 'attemptsAllowed must be >= 1');
    out.attemptsAllowed = n;
  }
  if (payload.passPercent != null) {
    const n = toInt(payload.passPercent, 70);
    if (n < 0 || n > 100) throw httpError(400, 'passPercent must be 0..100');
    out.passPercent = n;
  }

  if (payload.shuffleQuestions != null) {
    out.shuffleQuestions = !!payload.shuffleQuestions;
  }
  if (payload.shuffleOptions != null) {
    out.shuffleOptions = !!payload.shuffleOptions;
  }

  // pricing updates
  if (payload.pricing != null && typeof payload.pricing === 'object') {
    const p = payload.pricing;
    const pricing = {};
    if (p.isFree != null) pricing.isFree = !!p.isFree;
    if (p.includedInMembership != null) pricing.includedInMembership = !!p.includedInMembership;
    if (p.amountMinor != null) {
      const a = toInt(p.amountMinor, 0);
      if (a < 0) throw httpError(400, 'amountMinor must be >= 0');
      pricing.amountMinor = a;
    }
    if (p.currency != null) pricing.currency = String(p.currency || 'GBP').toUpperCase();

    // normalize
    if (pricing.isFree === true) pricing.amountMinor = 0;
    if (typeof pricing.amountMinor === 'number' && pricing.amountMinor > 0) pricing.isFree = false;

    out.pricing = pricing;
  }

  return out;
}

// ---------- CREATE ----------
async function createQuiz({ instructorId, isAdmin = false, payload }) {
  if (!instructorId) throw httpError(401, 'Auth required');

  const ownerId = instructorId;

  let courseId = null;
  if (payload?.courseId) {
    const c = await ensureInstructorOwnsCourse(payload.courseId, instructorId, isAdmin);
    courseId = c._id;
  }

  const basics = pickBasics(payload);
  if (!basics.title) throw httpError(400, 'Title is required');
  if (!basics.visibility) basics.visibility = 'enrolled';

  const quiz = await Quiz.create({
    ownerId,
    courseId,
    ...basics,
    isPublished: false,
    archivedAt: null,
  });

  return { quiz: shapeQuiz(quiz) };
}

// ---------- UPDATE ----------
async function updateQuizBasics({ instructorId, isAdmin = false, quizId, payload }) {
  const quiz = await getQuizOrThrow(quizId);
  if (!canManageQuiz(quiz, instructorId, isAdmin)) throw httpError(403, 'Not allowed');
  if (quiz.archivedAt) throw httpError(400, 'Cannot edit an archived quiz');

  const updates = pickBasics(payload);
  if (Object.keys(updates).length === 0) {
    const fresh = await Quiz.findById(quizId).lean();
    return { quiz: shapeQuiz(fresh), updated: false };
  }

  const doc = await Quiz.findByIdAndUpdate(quizId, updates, { new: true, runValidators: true });
  return { quiz: shapeQuiz(doc), updated: true };
}

// ---------- PUBLISH / UNPUBLISH ----------
async function publishQuiz({ instructorId, isAdmin = false, quizId }) {
  const quiz = await getQuizOrThrow(quizId);
  if (!canManageQuiz(quiz, instructorId, isAdmin)) throw httpError(403, 'Not allowed');
  if (quiz.archivedAt) throw httpError(400, 'Cannot publish an archived quiz');

  if (!quiz.title) throw httpError(400, 'Title required');
  if (quiz.attemptsAllowed < 1) throw httpError(400, 'attemptsAllowed must be >= 1');
  if (quiz.passPercent < 0 || quiz.passPercent > 100) throw httpError(400, 'passPercent must be 0..100');
  if ((quiz.questionCount || 0) < 1) throw httpError(400, 'Add at least one question');
  if ((quiz.totalPoints || 0) < 1) throw httpError(400, 'Total points must be >= 1');

  const updated = await Quiz.findByIdAndUpdate(quizId, { isPublished: true }, { new: true });
  return { ok: true, quiz: shapeQuiz(updated) };
}

async function unpublishQuiz({ instructorId, isAdmin = false, quizId }) {
  const quiz = await getQuizOrThrow(quizId);
  if (!canManageQuiz(quiz, instructorId, isAdmin)) throw httpError(403, 'Not allowed');

  const updated = await Quiz.findByIdAndUpdate(quizId, { isPublished: false }, { new: true });
  return { ok: true, quiz: shapeQuiz(updated) };
}

// ---------- DELETE ----------
async function deleteQuiz({ instructorId, isAdmin = false, quizId }) {
  const quiz = await getQuizOrThrow(quizId);
  if (!canManageQuiz(quiz, instructorId, isAdmin)) throw httpError(403, 'Not allowed');
  if (quiz.isPublished) throw httpError(400, 'Only unpublished quizzes can be deleted');

  const attempts = await QuizAttempt.countDocuments({ quizId });
  if (attempts > 0) throw httpError(400, 'Cannot delete a quiz that has attempts');

  await Quiz.deleteOne({ _id: quizId });
  return { deleted: true };
}

// ---------- LIST / GET ----------
async function listMyQuizzes({ instructorId, isAdmin = false, courseId, q, page = 1, limit = 12 }) {
  if (!instructorId) throw httpError(401, 'Auth required');
  page = Math.max(1, Number(page) || 1);
  limit = Math.min(50, Math.max(1, Number(limit) || 12));
  const skip = (page - 1) * limit;

  const query = { ownerId: instructorId };

  if (courseId) {
    const c = await ensureInstructorOwnsCourse(courseId, instructorId, isAdmin);
    query.courseId = c._id;
  }

  if (q && String(q).trim()) {
    const s = String(q).trim();
    query.$or = [
      { title: { $regex: s, $options: 'i' } },
      { description: { $regex: s, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Quiz.find(query).sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit),
    Quiz.countDocuments(query),
  ]);

  return {
    items: items.map(shapeQuiz),
    meta: { page, limit, total, hasNextPage: page * limit < total },
  };
}

async function getMyQuiz({ instructorId, isAdmin = false, quizId }) {
  const quiz = await getQuizOrThrow(quizId);
  if (!canManageQuiz(quiz, instructorId, isAdmin)) throw httpError(403, 'Not allowed');
  return { quiz: shapeQuiz(quiz) };
}

module.exports = {
  createQuiz,
  updateQuizBasics,
  publishQuiz,
  unpublishQuiz,
  deleteQuiz,
  listMyQuizzes,
  getMyQuiz,
};
