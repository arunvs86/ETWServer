require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Quiz = require('../models/Quiz');
const QuizQuestion = require('../models/QuizQuestion');
const QuizAttempt = require('../models/QuizAttempt');

function arraysEqualAsSets(a = [], b = []) {
  if (a.length !== b.length) return false;
  const A = new Set(a), B = new Set(b);
  for (const x of A) if (!B.has(x)) return false;
  return true;
}

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const [student, quiz] = await Promise.all([
      User.findOne({ email: 'demo.student@example.com' }),
      Quiz.findOne({ title: 'UCAT Starter Quiz' })
    ]);
    if (!student) throw new Error('Demo student not found.');
    if (!quiz) throw new Error('Quiz not found. Run smoke-quiz first.');

    const questions = await QuizQuestion.find({ quizId: quiz._id }).sort({ order: 1 }).lean();

    // student answers (intentionally 3 correct, 1 wrong)
    const answersPayload = [
      { questionId: questions[0]._id, selectedOptionIds: ['A'] },         // correct (1 pt)
      { questionId: questions[1]._id, selectedOptionIds: ['A','B'] },     // missing D -> wrong (0 pt)
      { questionId: questions[2]._id, booleanAnswer: false },             // correct (1 pt)
      { questionId: questions[3]._id, textAnswer: '900' }                 // correct (2 pt)
    ];

    // create attempt
    const attempt = await QuizAttempt.create({
      quizId: quiz._id,
      userId: student._id,
      status: 'in_progress',
      answers: answersPayload
    });

    // grade it
    let score = 0;
    let maxScore = 0;
    for (const q of questions) {
      maxScore += q.points || 0;
      const ans = answersPayload.find(a => a.questionId.toString() === q._id.toString());
      if (!ans) continue;

      if (q.type === 'mcq') {
        if (arraysEqualAsSets(ans.selectedOptionIds || [], q.correctOptionIds || [])) score += q.points;
      }
      if (q.type === 'multi') {
        if (arraysEqualAsSets(ans.selectedOptionIds || [], q.correctOptionIds || [])) score += q.points;
      }
      if (q.type === 'boolean') {
        if (typeof ans.booleanAnswer === 'boolean' && ans.booleanAnswer === q.correctBoolean) score += q.points;
      }
      if (q.type === 'short') {
        const given = (ans.textAnswer || '').trim().toLowerCase();
        const accepted = (q.correctText || []).map(s => s.trim().toLowerCase());
        if (accepted.includes(given)) score += q.points;
      }
    }

    const percent = maxScore ? Math.round((score / maxScore) * 100) : 0;
    const passed = percent >= (quiz.passPercent || 0);

    attempt.score = score;
    attempt.maxScore = maxScore;
    attempt.percent = percent;
    attempt.passed = passed;
    attempt.finish(); // sets completedAt, timeTakenSec, status
    await attempt.save();

    console.log('📝 attempt graded:', {
      attemptId: attempt._id.toString(),
      score,
      maxScore,
      percent,
      passed,
      timeTakenSec: attempt.timeTakenSec
    });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-quiz-attempt failed:', err.message || err);
    process.exit(1);
  }
})();
