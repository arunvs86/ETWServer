// src/utils/quizGrader.js
const { Types } = require('mongoose');

/**
 * Normalize an answers array into a Map<questionId, normalizedAnswer>
 */
function normalizeAnswers(answers = []) {
  const map = new Map();
  for (const a of answers) {
    const qid = String(a.questionId);
    if (!qid) continue;
    const entry = { questionId: qid };
    if (Array.isArray(a.selectedOptionIds)) {
      entry.selectedOptionIds = a.selectedOptionIds.map(String);
    }
    if (typeof a.booleanAnswer === 'boolean') {
      entry.booleanAnswer = a.booleanAnswer;
    }
    if (typeof a.textAnswer === 'string') {
      entry.textAnswer = a.textAnswer.trim();
    }
    map.set(qid, entry);
  }
  return map;
}

/**
 * Grade a single question.
 * Returns { earned, max, correct, details }
 */
function gradeQuestion(qDoc, answer) {
  const max = Math.max(0, Number(qDoc.points || 0));
  const type = qDoc.type;

  if (max === 0) return { earned: 0, max, correct: true, details: { reason: 'zero-point question' } };

  if (type === 'mcq') {
    const correctId = String(qDoc.correctOptionIds?.[0] || '');
    const selected = String((answer?.selectedOptionIds || [])[0] || '');
    const ok = correctId && selected && correctId === selected;
    return { earned: ok ? max : 0, max, correct: ok };
  }

  if (type === 'multi') {
    const correct = new Set((qDoc.correctOptionIds || []).map(String));
    const selected = new Set((answer?.selectedOptionIds || []).map(String));
    const isExact =
      correct.size === selected.size &&
      [...correct].every((id) => selected.has(id));
    return { earned: isExact ? max : 0, max, correct: isExact };
  }

  if (type === 'boolean') {
    const ok = typeof answer?.booleanAnswer === 'boolean'
      ? answer.booleanAnswer === !!qDoc.correctBoolean
      : false;
    return { earned: ok ? max : 0, max, correct: ok };
  }

  if (type === 'short') {
    const accepted = (qDoc.correctText || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
    const given = String(answer?.textAnswer || '').trim().toLowerCase();
    const ok = !!given && accepted.includes(given);
    return { earned: ok ? max : 0, max, correct: ok };
  }

  // Unknown type – no credit
  return { earned: 0, max, correct: false, details: { reason: 'unknown type' } };
}

/**
 * Grade an attempt.
 * @param {Array} questions - full question docs (with keys)
 * @param {Array} answers - attempt.answers
 * @returns {Object} summary
 */
function gradeAttempt(questions = [], answers = []) {
  const ansMap = normalizeAnswers(answers);

  let score = 0;
  let maxScore = 0;
  const perQuestion = [];

  for (const q of questions) {
    const a = ansMap.get(String(q._id));
    const { earned, max, correct } = gradeQuestion(q, a);
    score += earned;
    maxScore += max;
    perQuestion.push({
      questionId: q._id,
      earned,
      max,
      correct,
    });
  }

  const percent = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;

  return { score, maxScore, percent, perQuestion };
}

module.exports = {
  gradeAttempt,
  gradeQuestion,
};
