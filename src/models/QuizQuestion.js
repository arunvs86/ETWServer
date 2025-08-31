const { Schema, model, Types } = require('mongoose');

const MediaSchema = new Schema(
  { kind: { type: String, enum: ['image','audio','video'], default: 'image' },
    url:  { type: String, required: true, trim: true },
    alt:  { type: String, default: '' } },
  { _id: false }
);

const OptionSchema = new Schema(
  { id:   { type: String, required: true },
    text: { type: String, required: true },
    media: { type: [MediaSchema], default: [] } },
  { _id: false }
);

const QuizQuestionSchema = new Schema(
  {
    quizId: { type: Types.ObjectId, ref: 'Quiz', required: true, index: true },
    order:  { type: Number, default: 0, index: true },

    type:   { type: String, enum: ['mcq','multi','boolean','short'], required: true, index: true },
    prompt: { type: String, required: true },

    options: { type: [OptionSchema], default: [] },
    correctOptionIds: { type: [String], default: [] },

    correctBoolean: { type: Boolean },
    correctText: { type: [String], default: [] },

    explanation: { type: String, default: '' },
    points: { type: Number, default: 1, min: 0 },

    media: { type: [MediaSchema], default: [] }, // stem media
  },
  { timestamps: true }
);

QuizQuestionSchema.pre('validate', function (next) {
  const t = this.type;
  if (t === 'mcq') {
    if (!this.options?.length) return next(new Error('MCQ requires options'));
    if (!this.correctOptionIds || this.correctOptionIds.length !== 1) {
      return next(new Error('MCQ requires exactly 1 correctOptionId'));
    }
  }
  if (t === 'multi') {
    if (!this.options?.length) return next(new Error('Multi requires options'));
    if (!this.correctOptionIds || this.correctOptionIds.length < 1) {
      return next(new Error('Multi requires at least 1 correctOptionId'));
    }
  }
  if (t === 'boolean') {
    if (typeof this.correctBoolean !== 'boolean') {
      return next(new Error('Boolean requires correctBoolean'));
    }
  }
  if (t === 'short') {
    if (!this.correctText || this.correctText.length < 1) {
      return next(new Error('Short requires at least one correctText'));
    }
  }
  next();
});

// Rollups
QuizQuestionSchema.statics.recalcQuizStats = async function (quizId) {
  const Quiz = require('./Quiz');
  const objId = typeof quizId === 'string' ? new Types.ObjectId(quizId) : quizId;

  const [stats] = await this.aggregate([
    { $match: { quizId: objId } },
    { $group: { _id: '$quizId', questionCount: { $sum: 1 }, totalPoints: { $sum: '$points' } } }
  ]);

  const questionCount = stats ? stats.questionCount : 0;
  const totalPoints = stats ? stats.totalPoints : 0;
  await Quiz.findByIdAndUpdate(objId, { questionCount, totalPoints });
};

QuizQuestionSchema.post('save', async function () {
  await this.constructor.recalcQuizStats(this.quizId);
});
QuizQuestionSchema.post('deleteOne', { document: true, query: false }, async function () {
  await this.constructor.recalcQuizStats(this.quizId);
});

module.exports = model('QuizQuestion', QuizQuestionSchema);
