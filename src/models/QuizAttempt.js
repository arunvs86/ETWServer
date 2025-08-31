// src/models/QuizAttempt.js
const { Schema, model, Types } = require('mongoose');

const AnswerSchema = new Schema(
  {
    questionId: { type: Types.ObjectId, ref: 'QuizQuestion', required: true },
    // supply one of the below depending on question type
    selectedOptionIds: { type: [String], default: [] }, // for mcq/multi
    booleanAnswer: { type: Boolean },                   // for boolean
    textAnswer: { type: String }                        // for short
  },
  { _id: false }
);

const QuizAttemptSchema = new Schema(
  {
    quizId: { type: Types.ObjectId, ref: 'Quiz', required: true, index: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },

    status: { type: String, enum: ['in_progress', 'submitted'], default: 'in_progress', index: true },
    startedAt: { type: Date, default: () => new Date() },
    completedAt: { type: Date },

    answers: { type: [AnswerSchema], default: [] },

    // grading snapshot
    score: { type: Number, default: 0, min: 0 },     // points earned
    maxScore: { type: Number, default: 0, min: 0 },
    percent: { type: Number, default: 0, min: 0, max: 100 },
    passed: { type: Boolean, default: false },

    timeTakenSec: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

// convenience method to finalize timing
QuizAttemptSchema.methods.finish = function () {
  this.completedAt = new Date();
  this.timeTakenSec = Math.max(0, Math.floor((this.completedAt - this.startedAt) / 1000));
  this.status = 'submitted';
};

module.exports = model('QuizAttempt', QuizAttemptSchema);
