// // src/services/publicQuiz.service.js
// const { Types } = require('mongoose');
// const Quiz = require('../models/Quiz');
// const QuizQuestion = require('../models/QuizQuestion');
// const QuizAttempt = require('../models/QuizAttempt');
// const { gradeAttempt } = require('../utils/quizGrader');

// function httpError(status, message) {
//   const e = new Error(message);
//   e.status = status;
//   return e;
// }

// const isObjId = (v) => Types.ObjectId.isValid(v);
// const toInt = (v, def = 0) =>
//   (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def);

// function shapeQuizPublic(q) {
//   if (!q) return null;
//   return {
//     id: q._id,
//     slug: q.slug,
//     title: q.title,
//     description: q.description,
//     timeLimitSec: q.timeLimitSec,
//     attemptsAllowed: q.attemptsAllowed,
//     passPercent: q.passPercent,
//     visibility: q.visibility, // 'public' | 'enrolled' (logged-in required for start)
//     isPublished: q.isPublished,
//     questionCount: q.questionCount,
//     totalPoints: q.totalPoints,
//     createdAt: q.createdAt,
//     updatedAt: q.updatedAt,
//   };
// }

// // Hide answer keys for play screens
// function shapeQuestionForPlay(q) {
//   return {
//     id: q._id,
//     type: q.type,
//     prompt: q.prompt,
//     options: (q.options || []).map((o) => ({ id: o.id, text: o.text })), // show options text
//     points: q.points,
//     // do NOT include: correctOptionIds | correctBoolean | correctText | explanation
//   };
// }

// // After submit, include explanations and correct keys
// function shapeQuestionForReview(q) {
//   return {
//     id: q._id,
//     type: q.type,
//     prompt: q.prompt,
//     options: (q.options || []).map((o) => ({ id: o.id, text: o.text })),
//     points: q.points,
//     explanation: q.explanation || '',
//     correctOptionIds: q.correctOptionIds || [],
//     correctBoolean: typeof q.correctBoolean === 'boolean' ? q.correctBoolean : undefined,
//     correctText: q.correctText || [],
//   };
// }

// // ---------- Public list ----------
// async function listPublished({ q, page = 1, limit = 12 }) {
//   page = Math.max(1, Number(page) || 1);
//   limit = Math.min(50, Math.max(1, Number(limit) || 12));
//   const skip = (page - 1) * limit;

//   const query = { isPublished: true };
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
//     items: items.map(shapeQuizPublic),
//     meta: { page, limit, total, hasNextPage: page * limit < total },
//   };
// }

// // ---------- Get by slug (no answers disclosed) ----------
// async function getBySlugPublic({ slug }) {
//   const quiz = await Quiz.findOne({ slug, isPublished: true }).lean();
//   if (!quiz) throw httpError(404, 'Quiz not found or not published');
//   const questions = await QuizQuestion.find({ quizId: quiz._id }).sort({ order: 1, _id: 1 }).lean();

//   return {
//     quiz: shapeQuizPublic(quiz),
//     questions: questions.map(shapeQuestionForPlay),
//   };
// }

// // ---------- Start attempt (auth required) ----------
// async function startAttempt({ slug, userId }) {
//   if (!userId) throw httpError(401, 'Login required');

//   const quiz = await Quiz.findOne({ slug, isPublished: true });
//   if (!quiz) throw httpError(404, 'Quiz not found or not published');

//   // Visibility: 'enrolled' = logged-in only for standalone MVP (already enforced above)
//   // If you later add course/membership gating, enforce here.

//   // Check attempts cap
//   const used = await QuizAttempt.countDocuments({ quizId: quiz._id, userId });
//   if (used >= (quiz.attemptsAllowed || 1)) {
//     throw httpError(400, 'No attempts remaining');
//   }

//   // Create attempt
//   const attempt = await QuizAttempt.create({
//     quizId: quiz._id,
//     userId,
//     status: 'in_progress',
//     answers: [],
//     score: 0,
//     maxScore: 0,
//     percent: 0,
//     passed: false,
//     timeTakenSec: 0,
//   });

//   // Prepare play-safe questions
//   const questions = await QuizQuestion.find({ quizId: quiz._id }).sort({ order: 1, _id: 1 }).lean();

//   // Optionally shuffle
//   let playQuestions = questions.slice();
//   if (quiz.shuffleQuestions) {
//     playQuestions = shuffleArray(playQuestions);
//   }
//   const questionsForPlay = playQuestions.map((q) => {
//     const shaped = shapeQuestionForPlay(q);
//     if (quiz.shuffleOptions && Array.isArray(shaped.options) && shaped.options.length > 1) {
//       shaped.options = shuffleArray(shaped.options);
//     }
//     return shaped;
//   });

//   // Time limit (client can use this for countdown)
//   const timeLimitSec = Math.max(0, Number(quiz.timeLimitSec || 0));
//   const expiresAt = timeLimitSec > 0 ? new Date(Date.now() + timeLimitSec * 1000) : null;

//   return {
//     attempt: {
//       id: attempt._id,
//       status: attempt.status,
//       startedAt: attempt.startedAt,
//       timeLimitSec,
//       expiresAt,
//     },
//     quiz: shapeQuizPublic(quiz),
//     questions: questionsForPlay,
//   };
// }

// // ---------- Upsert answers (auth, attempt owner, in_progress) ----------
// async function upsertAnswers({ attemptId, userId, patchAnswers }) {
//   if (!isObjId(attemptId)) throw httpError(400, 'Invalid attempt id');
//   const attempt = await QuizAttempt.findById(attemptId);
//   if (!attempt) throw httpError(404, 'Attempt not found');
//   if (String(attempt.userId) !== String(userId)) throw httpError(403, 'Not allowed');
//   if (attempt.status !== 'in_progress') throw httpError(400, 'Attempt already submitted');

//   // Normalize and upsert by questionId
//   const incoming = new Map();
//   for (const a of (patchAnswers || [])) {
//     const qid = String(a.questionId || '');
//     if (!qid || !isObjId(qid)) continue;
//     incoming.set(qid, {
//       questionId: qid,
//       selectedOptionIds: Array.isArray(a.selectedOptionIds) ? a.selectedOptionIds.map(String) : undefined,
//       booleanAnswer: typeof a.booleanAnswer === 'boolean' ? a.booleanAnswer : undefined,
//       textAnswer: typeof a.textAnswer === 'string' ? a.textAnswer : undefined,
//     });
//   }

//   const curr = new Map((attempt.answers || []).map((a) => [String(a.questionId), a]));
//   for (const [qid, ans] of incoming.entries()) {
//     curr.set(qid, { ...curr.get(qid), ...ans });
//   }

//   attempt.answers = [...curr.values()];
//   await attempt.save();

//   return { ok: true, attemptId: attempt._id, answersCount: attempt.answers.length };
// }

// // ---------- Submit attempt (auth, owner) ----------
// async function submitAttempt({ attemptId, userId }) {
//   if (!isObjId(attemptId)) throw httpError(400, 'Invalid attempt id');
//   const attempt = await QuizAttempt.findById(attemptId);
//   if (!attempt) throw httpError(404, 'Attempt not found');
//   if (String(attempt.userId) !== String(userId)) throw httpError(403, 'Not allowed');
//   if (attempt.status !== 'in_progress') {
//     // Idempotent: if already submitted, return the graded view
//     return getAttempt({ attemptId, userId });
//   }

//   const quiz = await Quiz.findById(attempt.quizId);
//   if (!quiz || !quiz.isPublished) throw httpError(400, 'Quiz not available for submission');

//   // Time limit enforcement
//   const limit = Math.max(0, Number(quiz.timeLimitSec || 0));
//   if (limit > 0) {
//     const elapsed = Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000);
//     if (elapsed > limit) {
//       // Still accept but mark timing
//       // (You can add attempt.timeExceeded = true if you want)
//     }
//   }

//   const questions = await QuizQuestion.find({ quizId: attempt.quizId }).sort({ order: 1, _id: 1 }).lean();
//   const summary = gradeAttempt(questions, attempt.answers || []);

//   attempt.finish();
//   attempt.score = summary.score;
//   attempt.maxScore = summary.maxScore;
//   attempt.percent = summary.percent;
//   attempt.passed = summary.percent >= (quiz.passPercent || 0);
//   await attempt.save();

//   // (Optional) update quiz rollups (lightweight + safe)
//   try {
//     const [agg] = await QuizAttempt.aggregate([
//       { $match: { quizId: quiz._id, status: 'submitted' } },
//       {
//         $group: {
//           _id: '$quizId',
//           attemptCount: { $sum: 1 },
//           passCount: { $sum: { $cond: ['$passed', 1, 0] } },
//           avgPercent: { $avg: '$percent' },
//         }
//       }
//     ]);
//     if (agg) {
//       await Quiz.findByIdAndUpdate(quiz._id, {
//         attemptCount: agg.attemptCount,
//         passCount: agg.passCount,
//         avgPercent: Math.round((agg.avgPercent || 0) * 100) / 100
//       });
//     }
//   } catch { /* best-effort, ignore errors */ }

//   // Build review payload
//   const reviewQuestions = questions.map(shapeQuestionForReview);
//   const perQ = new Map(summary.perQuestion.map(x => [String(x.questionId), x]));

//   return {
//     attempt: {
//       id: attempt._id,
//       status: attempt.status,
//       startedAt: attempt.startedAt,
//       completedAt: attempt.completedAt,
//       timeTakenSec: attempt.timeTakenSec,
//       score: attempt.score,
//       maxScore: attempt.maxScore,
//       percent: attempt.percent,
//       passed: attempt.passed,
//     },
//     quiz: shapeQuizPublic(quiz),
//     results: {
//       perQuestion: reviewQuestions.map((q) => ({
//         ...q,
//         grade: perQ.get(String(q.id)) || { earned: 0, max: q.points || 0, correct: false },
//       })),
//     },
//   };
// }

// // ---------- Get attempt (auth, owner) ----------
// async function getAttempt({ attemptId, userId }) {
//   if (!isObjId(attemptId)) throw httpError(400, 'Invalid attempt id');
//   const attempt = await QuizAttempt.findById(attemptId).lean();
//   if (!attempt) throw httpError(404, 'Attempt not found');
//   if (String(attempt.userId) !== String(userId)) throw httpError(403, 'Not allowed');

//   const quiz = await Quiz.findById(attempt.quizId).lean();
//   if (!quiz) throw httpError(404, 'Quiz missing');

//   const questions = await QuizQuestion.find({ quizId: attempt.quizId }).sort({ order: 1, _id: 1 }).lean();

//   if (attempt.status === 'in_progress') {
//     // Do NOT leak answers; only return user’s current saved answers + play-safe questions.
//     return {
//       attempt: {
//         id: attempt._id,
//         status: attempt.status,
//         startedAt: attempt.startedAt,
//         answers: attempt.answers || [],
//       },
//       quiz: shapeQuizPublic(quiz),
//       questions: questions.map(shapeQuestionForPlay),
//     };
//   }

//   // Submitted: show full review with explanations and grading snapshot
//   const summary = gradeAttempt(questions, attempt.answers || []);
//   const reviewQuestions = questions.map(shapeQuestionForReview);
//   const perQ = new Map(summary.perQuestion.map(x => [String(x.questionId), x]));

//   return {
//     attempt: {
//       id: attempt._id,
//       status: attempt.status,
//       startedAt: attempt.startedAt,
//       completedAt: attempt.completedAt,
//       timeTakenSec: attempt.timeTakenSec,
//       score: attempt.score,
//       maxScore: attempt.maxScore,
//       percent: attempt.percent,
//       passed: attempt.passed,
//       answers: attempt.answers || [],
//     },
//     quiz: shapeQuizPublic(quiz),
//     results: {
//       perQuestion: reviewQuestions.map((q) => ({
//         ...q,
//         grade: perQ.get(String(q.id)) || { earned: 0, max: q.points || 0, correct: false },
//       })),
//     },
//   };
// }

// // ---------- helpers ----------
// function shuffleArray(arr) {
//   const a = arr.slice();
//   for (let i = a.length - 1; i > 0; i--) {
//     const j = Math.floor(Math.random() * (i + 1));
//     [a[i], a[j]] = [a[j], a[i]];
//   }
//   return a;
// }

// module.exports = {
//   listPublished,
//   getBySlugPublic,
//   startAttempt,
//   upsertAnswers,
//   submitAttempt,
//   getAttempt,
// };


// src/services/publicQuiz.service.js
const { Types } = require('mongoose');
const Quiz = require('../models/Quiz');
const QuizQuestion = require('../models/QuizQuestion');
const QuizAttempt = require('../models/QuizAttempt');
const Membership = require('../models/Membership');
const Order = require('../models/Order');
const { gradeAttempt } = require('../utils/quizGrader');
const quizSale = require('./quizSale.service'); // ✅ add

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const isObjId = (v) => Types.ObjectId.isValid(v);
const toInt = (v, def = 0) =>
  (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def);

function shapeQuizPublic(q) {
  if (!q) return null;
  const pricing = q.pricing || {};
  return {
    id: q._id,
    slug: q.slug,
    title: q.title,
    description: q.description,
    timeLimitSec: q.timeLimitSec,
    attemptsAllowed: q.attemptsAllowed,
    passPercent: q.passPercent,
    isPublished: q.isPublished,
    visibility: q.visibility,
    questionCount: q.questionCount,
    totalPoints: q.totalPoints,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    // ✅ include pricing with safe defaults
    pricing: {
      isFree: !!pricing.isFree,
      includedInMembership: !!pricing.includedInMembership,
      amountMinor: Number(pricing.amountMinor || 0),
      currency: pricing.currency || 'GBP',
    },
  };
}

// Hide answer keys for play screens
function shapeQuestionForPlay(q) {
  return {
    id: q._id,
    type: q.type,
    prompt: q.prompt,
    options: (q.options || []).map((o) => ({ id: o.id, text: o.text })),
    points: q.points,
  };
}

// After submit, include explanations and correct keys
function shapeQuestionForReview(q) {
  return {
    id: q._id,
    type: q.type,
    prompt: q.prompt,
    options: (q.options || []).map((o) => ({ id: o.id, text: o.text })),
    points: q.points,
    explanation: q.explanation || '',
    correctOptionIds: q.correctOptionIds || [],
    correctBoolean: typeof q.correctBoolean === 'boolean' ? q.correctBoolean : undefined,
    correctText: q.correctText || [],
  };
}

async function hasActiveMembership(userId) {
  if (!Types.ObjectId.isValid(userId)) return false;
  const mem = await Membership.findOne({ userId }).lean();
  if (!mem) return false;
  const now = new Date();
  return (mem.status === 'active' || mem.status === 'trialing')
    && now >= mem.currentPeriodStart && now < mem.currentPeriodEnd;
}

async function hasPurchasedQuiz(userId, quizId) {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(quizId)) return false;
  const doc = await Order.findOne({
    userId,
    status: 'paid',
    'items.kind': 'quiz',
    'items.refId': quizId,
  }).select({ _id: 1 }).lean();
  return !!doc;
}

async function checkEntitlement(quiz, userId) {
  if (quiz.pricing?.isFree) {
    return { ok: true, reason: null, requiresPurchase: false, requiresMembership: false };
  }
  if (quiz.pricing?.includedInMembership) {
    const active = await hasActiveMembership(userId);
    if (active) return { ok: true, reason: null, requiresPurchase: false, requiresMembership: true };
    return { ok: false, reason: 'membership_required', requiresPurchase: false, requiresMembership: true };
  }
  const owns = await hasPurchasedQuiz(userId, quiz._id);
  if (owns) return { ok: true, reason: null, requiresPurchase: true, requiresMembership: false };
  return { ok: false, reason: 'purchase_required', requiresPurchase: true, requiresMembership: false };
}

// ---------- Public list ----------
async function listPublished({ q, page = 1, limit = 12 }) {
  page = Math.max(1, Number(page) || 1);
  limit = Math.min(50, Math.max(1, Number(limit) || 12));
  const skip = (page - 1) * limit;

  const query = { isPublished: true };
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
    items: items.map((quiz) => ({
      ...shapeQuizPublic(quiz),
      pricing: {
        isFree: !!quiz.pricing?.isFree,
        includedInMembership: !!quiz.pricing?.includedInMembership,
        amountMinor: quiz.pricing?.amountMinor || 0,
        currency: quiz.pricing?.currency || 'GBP',
      },
    })),
    meta: { page, limit, total, hasNextPage: page * limit < total },
  };
}

// ---------- Get by slug ----------
async function getBySlugPublic({ slug, userId = null }) {
  const quiz = await Quiz.findOne({ slug, isPublished: true }).lean();
  if (!quiz) throw httpError(404, 'Quiz not found or not published');
  const questions = await QuizQuestion.find({ quizId: quiz._id }).sort({ order: 1, _id: 1 }).lean();

  const isFree = !!quiz.pricing?.isFree;
  const includedInMembership = !!quiz.pricing?.includedInMembership;

  let memberActive = false;
  let purchased = false;

  if (userId) {
    if (includedInMembership) {
      memberActive = await quizSale.userHasActiveMembership(userId);
    }
    if (!isFree && !includedInMembership) {
      purchased = await quizSale.userHasPurchasedQuiz(userId, quiz._id);
    }
  }

  const entitlement = {
    isFree,
    includedInMembership,
    memberActive,
    purchased,
    canStart: isFree || memberActive || purchased,
  };

  return {
    quiz: shapeQuizPublic(quiz),
    questions: questions.map(shapeQuestionForPlay),
    entitlement, // ✅ FE can render the right CTA
  };
}

// ---------- Start attempt ----------
// async function startAttempt({ slug, userId }) {
//   if (!userId) throw httpError(401, 'Login required');

//   const quiz = await Quiz.findOne({ slug, isPublished: true });
//   if (!quiz) throw httpError(404, 'Quiz not found or not published');

//   // entitlement
//   const ent = await checkEntitlement(quiz, userId);
//   if (!ent.ok) {
//     const err = httpError(402, ent.reason === 'membership_required'
//       ? 'Active membership required'
//       : 'Purchase required');
//     err.code = ent.reason;
//     throw err;
//   }

//   // attempts cap
//   const used = await QuizAttempt.countDocuments({ quizId: quiz._id, userId });
//   if (used >= (quiz.attemptsAllowed || 1)) {
//     throw httpError(400, 'No attempts remaining');
//   }

//   // create attempt
//   const attempt = await QuizAttempt.create({
//     quizId: quiz._id,
//     userId,
//     status: 'in_progress',
//     answers: [],
//     score: 0,
//     maxScore: 0,
//     percent: 0,
//     passed: false,
//     timeTakenSec: 0,
//   });

//   const questions = await QuizQuestion.find({ quizId: quiz._id }).sort({ order: 1, _id: 1 }).lean();

//   // shuffle
//   let playQuestions = questions.slice();
//   if (quiz.shuffleQuestions) {
//     playQuestions = shuffleArray(playQuestions);
//   }
//   const questionsForPlay = playQuestions.map((q) => {
//     const shaped = shapeQuestionForPlay(q);
//     if (quiz.shuffleOptions && Array.isArray(shaped.options) && shaped.options.length > 1) {
//       shaped.options = shuffleArray(shaped.options);
//     }
//     return shaped;
//   });

//   const timeLimitSec = Math.max(0, Number(quiz.timeLimitSec || 0));
//   const expiresAt = timeLimitSec > 0 ? new Date(Date.now() + timeLimitSec * 1000) : null;

//   return {
//     attempt: {
//       id: attempt._id,
//       status: attempt.status,
//       startedAt: attempt.startedAt,
//       timeLimitSec,
//       expiresAt,
//     },
//     quiz: {
//       ...shapeQuizPublic(quiz),
//       pricing: {
//         isFree: !!quiz.pricing?.isFree,
//         includedInMembership: !!quiz.pricing?.includedInMembership,
//         amountMinor: quiz.pricing?.amountMinor || 0,
//         currency: quiz.pricing?.currency || 'GBP',
//       },
//     },
//     questions: questionsForPlay,
//   };
// }

async function startAttempt({ slug, userId }) {
  if (!userId) throw httpError(401, 'Login required');

  const quiz = await Quiz.findOne({ slug, isPublished: true });
  if (!quiz) throw httpError(404, 'Quiz not found or not published');

  // ✅ ENFORCE ENTITLEMENT
  const isFree = !!quiz.pricing?.isFree;
  const includedInMembership = !!quiz.pricing?.includedInMembership;

  if (!isFree) {
    if (includedInMembership) {
      const ok = await quizSale.userHasActiveMembership(userId);
      if (!ok) throw httpError(402, 'Membership required');
    } else {
      // paid-only → must have an Order
      const bought = await quizSale.userHasPurchasedQuiz(userId, quiz._id);
      if (!bought) throw httpError(402, 'Payment required');
    }
  }

  // attempts cap
  const used = await QuizAttempt.countDocuments({ quizId: quiz._id, userId });
  if (used >= (quiz.attemptsAllowed || 1)) {
    throw httpError(400, 'No attempts remaining');
  }

  // Create attempt
  const attempt = await QuizAttempt.create({
    quizId: quiz._id,
    userId,
    status: 'in_progress',
    answers: [],
    score: 0,
    maxScore: 0,
    percent: 0,
    passed: false,
    timeTakenSec: 0,
  });

  // Prepare play-safe questions
  const questions = await QuizQuestion.find({ quizId: quiz._id }).sort({ order: 1, _id: 1 }).lean();

  // Optional shuffle
  let playQuestions = questions.slice();
  if (quiz.shuffleQuestions) {
    playQuestions = shuffleArray(playQuestions);
  }
  const questionsForPlay = playQuestions.map((q) => {
    const shaped = shapeQuestionForPlay(q);
    if (quiz.shuffleOptions && Array.isArray(shaped.options) && shaped.options.length > 1) {
      shaped.options = shuffleArray(shaped.options);
    }
    return shaped;
  });

  const timeLimitSec = Math.max(0, Number(quiz.timeLimitSec || 0));
  const expiresAt = timeLimitSec > 0 ? new Date(Date.now() + timeLimitSec * 1000) : null;

  return {
    attempt: { id: attempt._id, status: attempt.status, startedAt: attempt.startedAt, timeLimitSec, expiresAt },
    quiz: shapeQuizPublic(quiz),
    questions: questionsForPlay,
  };
}

// ---------- Upsert answers ----------
async function upsertAnswers({ attemptId, userId, patchAnswers }) {
  if (!isObjId(attemptId)) throw httpError(400, 'Invalid attempt id');
  const attempt = await QuizAttempt.findById(attemptId);
  if (!attempt) throw httpError(404, 'Attempt not found');
  if (String(attempt.userId) !== String(userId)) throw httpError(403, 'Not allowed');
  if (attempt.status !== 'in_progress') throw httpError(400, 'Attempt already submitted');

  const incoming = new Map();
  for (const a of (patchAnswers || [])) {
    const qid = String(a.questionId || '');
    if (!qid || !isObjId(qid)) continue;
    incoming.set(qid, {
      questionId: qid,
      selectedOptionIds: Array.isArray(a.selectedOptionIds) ? a.selectedOptionIds.map(String) : undefined,
      booleanAnswer: typeof a.booleanAnswer === 'boolean' ? a.booleanAnswer : undefined,
      textAnswer: typeof a.textAnswer === 'string' ? a.textAnswer : undefined,
    });
  }

  const curr = new Map((attempt.answers || []).map((a) => [String(a.questionId), a]));
  for (const [qid, ans] of incoming.entries()) {
    curr.set(qid, { ...curr.get(qid), ...ans });
  }

  attempt.answers = [...curr.values()];
  await attempt.save();

  return { ok: true, attemptId: attempt._id, answersCount: attempt.answers.length };
}

// ---------- Submit attempt ----------
async function submitAttempt({ attemptId, userId }) {
  if (!isObjId(attemptId)) throw httpError(400, 'Invalid attempt id');
  const attempt = await QuizAttempt.findById(attemptId);
  if (!attempt) throw httpError(404, 'Attempt not found');
  if (String(attempt.userId) !== String(userId)) throw httpError(403, 'Not allowed');
  if (attempt.status !== 'in_progress') {
    return getAttempt({ attemptId, userId });
  }

  const quiz = await Quiz.findById(attempt.quizId);
  if (!quiz || !quiz.isPublished) throw httpError(400, 'Quiz not available for submission');

  const limit = Math.max(0, Number(quiz.timeLimitSec || 0));
  if (limit > 0) {
    const elapsed = Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000);
    if (elapsed > limit) {
      // allow but late (optionally mark a flag)
    }
  }

  const questions = await QuizQuestion.find({ quizId: attempt.quizId }).sort({ order: 1, _id: 1 }).lean();
  const summary = gradeAttempt(questions, attempt.answers || []);

  attempt.finish();
  attempt.score = summary.score;
  attempt.maxScore = summary.maxScore;
  attempt.percent = summary.percent;
  attempt.passed = summary.percent >= (quiz.passPercent || 0);
  await attempt.save();

  try {
    const [agg] = await QuizAttempt.aggregate([
      { $match: { quizId: quiz._id, status: 'submitted' } },
      {
        $group: {
          _id: '$quizId',
          attemptCount: { $sum: 1 },
          passCount: { $sum: { $cond: ['$passed', 1, 0] } },
          avgPercent: { $avg: '$percent' },
        }
      }
    ]);
    if (agg) {
      await Quiz.findByIdAndUpdate(quiz._id, {
        attemptCount: agg.attemptCount,
        passCount: agg.passCount,
        avgPercent: Math.round((agg.avgPercent || 0) * 100) / 100
      });
    }
  } catch {}

  const reviewQuestions = questions.map(shapeQuestionForReview);
  const perQ = new Map(summary.perQuestion.map(x => [String(x.questionId), x]));

  return {
    attempt: {
      id: attempt._id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      timeTakenSec: attempt.timeTakenSec,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percent: attempt.percent,
      passed: attempt.passed,
    },
    quiz: shapeQuizPublic(quiz),
    results: {
      perQuestion: reviewQuestions.map((q) => ({
        ...q,
        grade: perQ.get(String(q.id)) || { earned: 0, max: q.points || 0, correct: false },
      })),
    },
  };
}

// ---------- Get attempt ----------
async function getAttempt({ attemptId, userId }) {
  if (!isObjId(attemptId)) throw httpError(400, 'Invalid attempt id');
  const attempt = await QuizAttempt.findById(attemptId).lean();
  if (!attempt) throw httpError(404, 'Attempt not found');
  if (String(attempt.userId) !== String(userId)) throw httpError(403, 'Not allowed');

  const quiz = await Quiz.findById(attempt.quizId).lean();
  if (!quiz) throw httpError(404, 'Quiz missing');

  const questions = await QuizQuestion.find({ quizId: attempt.quizId }).sort({ order: 1, _id: 1 }).lean();

  if (attempt.status === 'in_progress') {
    return {
      attempt: {
        id: attempt._id,
        status: attempt.status,
        startedAt: attempt.startedAt,
        answers: attempt.answers || [],
      },
      quiz: shapeQuizPublic(quiz),
      questions: questions.map(shapeQuestionForPlay),
    };
  }

  const summary = gradeAttempt(questions, attempt.answers || []);
  const reviewQuestions = questions.map(shapeQuestionForReview);
  const perQ = new Map(summary.perQuestion.map(x => [String(x.questionId), x]));

  return {
    attempt: {
      id: attempt._id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      timeTakenSec: attempt.timeTakenSec,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percent: attempt.percent,
      passed: attempt.passed,
      answers: attempt.answers || [],
    },
    quiz: shapeQuizPublic(quiz),
    results: {
      perQuestion: reviewQuestions.map((q) => ({
        ...q,
        grade: perQ.get(String(q.id)) || { earned: 0, max: q.points || 0, correct: false },
      })),
    },
  };
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


module.exports = {
  listPublished,
  getBySlugPublic,
  startAttempt,
  upsertAnswers,
  submitAttempt,
  getAttempt,
};
