const mongoose = require('mongoose');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const { httpError } = require('../utils/httpError');
const { shapeQuizPublic } = require('../services/publicQuiz.service'); // reuse your shaper

function getUserId(req) {
  return req.user?.id || req.user?._id || req.headers['x-user-id'] || null;
}

// GET /api/me/attempts?q=&page=&limit=
async function listMyAttempts(req, res, next) {
  try {
    console.log("COming here")
    const userId = getUserId(req);
    if (!userId) throw httpError(401, 'Login required');

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 12)));
    const q = (req.query.q || '').trim();

    // optional search by quiz title
    const quizMatch = {};
    if (q) quizMatch.title = { $regex: q, $options: 'i' };

    // join attempts with quiz to enable search + shaping
    const [rows, [{ total = 0 } = {}]] = await Promise.all([
      QuizAttempt.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $sort: { completedAt: -1, startedAt: -1, _id: -1 } },
        {
          $lookup: {
            from: 'quizzes',
            localField: 'quizId',
            foreignField: '_id',
            as: 'quiz',
          }
        },
        { $unwind: '$quiz' },
        ...(q ? [{ $match: { 'quiz.title': quizMatch.title } }] : []),
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $project: {
            _id: 1, quizId: 1, status: 1, startedAt: 1, completedAt: 1,
            score: 1, maxScore: 1, percent: 1, passed: 1, attemptNo: 1, timeTakenSec: 1,
            quiz: {
              _id: '$quiz._id',
              title: '$quiz.title',
              description: '$quiz.description',
              visibility: '$quiz.visibility',
              isPublished: '$quiz.isPublished',
              questionCount: '$quiz.questionCount',
              totalPoints: '$quiz.totalPoints',
              passPercent: '$quiz.passPercent',
              attemptsAllowed: '$quiz.attemptsAllowed',
              slug: '$quiz.slug',
              updatedAt: '$quiz.updatedAt',
            }
          }
        }
      ]),
      QuizAttempt.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $lookup: {
            from: 'quizzes',
            localField: 'quizId',
            foreignField: '_id',
            as: 'quiz',
          }
        },
        { $unwind: '$quiz' },
        ...(q ? [{ $match: { 'quiz.title': quizMatch.title } }] : []),
        { $count: 'total' }
      ])
    ]);

    res.json({
      items: rows.map(r => ({
        id: r._id,
        quizId: r.quizId,
        status: r.status,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        score: r.score,
        maxScore: r.maxScore,
        percent: r.percent,
        passed: r.passed,
        attemptNo: r.attemptNo,
        timeTakenSec: r.timeTakenSec,
        quiz: {
          id: r.quiz._id,
          title: r.quiz.title,
          description: r.quiz.description,
          visibility: r.quiz.visibility,
          isPublished: r.quiz.isPublished,
          questionCount: r.quiz.questionCount,
          totalPoints: r.quiz.totalPoints,
          passPercent: r.quiz.passPercent,
          attemptsAllowed: r.quiz.attemptsAllowed,
          slug: r.quiz.slug,
          updatedAt: r.quiz.updatedAt,
        }
      })),
      meta: {
        page,
        limit,
        total,
        hasNextPage: (page * limit) < total
      }
    });
  } catch (e) { next(e); }
}

// GET /api/me/quizzes/:slug/attempts
async function listMyAttemptsBySlug(req, res, next) {
  try {
    const userId = getUserId(req);
    if (!userId) throw httpError(401, 'Login required');
    const slug = String(req.params.slug);

    const quiz = await Quiz.findOne({ slug }).lean();
    if (!quiz) throw httpError(404, 'Quiz not found');

    const attempts = await QuizAttempt
      .find({ userId, quizId: quiz._id })
      .sort({ completedAt: -1, startedAt: -1, _id: -1 })
      .lean();

    res.json({
      quiz: shapeQuizPublic(quiz),
      items: attempts.map(a => ({
        id: a._id,
        quizId: a.quizId,
        status: a.status,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
        score: a.score,
        maxScore: a.maxScore,
        percent: a.percent,
        passed: a.passed,
        attemptNo: a.attemptNo,
        timeTakenSec: a.timeTakenSec,
      })),
    });
  } catch (e) { next(e); }
}

module.exports = { listMyAttempts, listMyAttemptsBySlug };
