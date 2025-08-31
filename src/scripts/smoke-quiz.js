require('dotenv').config();
const connectDB = require('../config/db');
const Course = require('../models/Course');
const Quiz = require('../models/Quiz');
const QuizQuestion = require('../models/QuizQuestion');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const course = await Course.findOne({ slug: 'ucat-masterclass-2025' });
    if (!course) throw new Error('Course not found. Run smoke-course first.');

    // upsert quiz
    const quiz = await Quiz.findOneAndUpdate(
      { courseId: course._id, title: 'UCAT Starter Quiz' },
      {
        courseId: course._id,
        title: 'UCAT Starter Quiz',
        description: 'Quick check of fundamentals.',
        timeLimitSec: 600,
        attemptsAllowed: 3,
        passPercent: 70,
        isPublished: true,
        visibility: 'enrolled'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // upsert questions
    const Q = [
      {
        order: 1, type: 'mcq', prompt: 'UCAT stands for?',
        options: [{id:'A',text:'University Clinical Aptitude Test'}, {id:'B',text:'Undergrad Cognitive Ability Test'}],
        correctOptionIds: ['A'],
        points: 1
      },
      {
        order: 2, type: 'multi', prompt: 'Which sections are part of UCAT?',
        options: [
          {id:'A',text:'Verbal Reasoning'}, {id:'B',text:'Quantitative Reasoning'},
          {id:'C',text:'Mechanical Reasoning'}, {id:'D',text:'Situational Judgement'}
        ],
        correctOptionIds: ['A','B','D'],
        points: 2
      },
      {
        order: 3, type: 'boolean', prompt: 'UCAT includes an Essay section.',
        correctBoolean: false,
        points: 1
      },
      {
        order: 4, type: 'short', prompt: 'Max UCAT score per section (not SJT)?',
        correctText: ['900'],
        points: 2
      }
    ];

    for (const q of Q) {
      await QuizQuestion.findOneAndUpdate(
        { quizId: quiz._id, order: q.order },
        { quizId: quiz._id, ...q },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // refresh rollups
    await QuizQuestion.recalcQuizStats(quiz._id);
    const fresh = await Quiz.findById(quiz._id).lean();

    console.log('🧩 quiz ready:', {
      id: quiz._id.toString(),
      title: quiz.title,
      questionCount: fresh.questionCount,
      totalPoints: fresh.totalPoints
    });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-quiz failed:', err.message || err);
    process.exit(1);
  }
})();
