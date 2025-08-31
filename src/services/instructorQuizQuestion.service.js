// const { Types } = require('mongoose');
// const Quiz = require('../models/Quiz');
// const QuizQuestion = require('../models/QuizQuestion');
// const Course = require('../models/Course');

// const isObjId = (v)=>Types.ObjectId.isValid(v);
// const toInt = (v, def=0)=> (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def);
// function httpError(s,m){ const e=new Error(m); e.status=s; return e; }

// async function ensureOwnsQuiz(quizId, instructorId){
//   if (!isObjId(quizId)) throw httpError(400,'Invalid quiz id');
//   const quiz = await Quiz.findById(quizId).lean();
//   if (!quiz) throw httpError(404,'Quiz not found');

//   if (quiz.courseId) {
//     const course = await Course.findById(quiz.courseId).lean();
//     if (!course) throw httpError(404,'Parent course missing');
//     if (!instructorId || String(course.instructorId)!==String(instructorId)) throw httpError(403,'Not allowed');
//   } else {
//     if (!instructorId) throw httpError(403,'Not allowed');
//   }
//   return quiz;
// }

// async function ensureOwnsQuestion(questionId, instructorId){
//   if (!isObjId(questionId)) throw httpError(400,'Invalid question id');
//   const q = await QuizQuestion.findById(questionId).lean();
//   if (!q) throw httpError(404,'Question not found');
//   await ensureOwnsQuiz(q.quizId, instructorId);
//   return q;
// }

// const cleanMedia = (list) => (Array.isArray(list)?list:[])
//   .map(m=>({ kind: (m?.kind==='audio'||m?.kind==='video')?m.kind:'image', url:String(m?.url||'').trim(), alt:String(m?.alt||'') }))
//   .filter(m=>!!m.url);

// const cleanOptions = (options) => (Array.isArray(options)?options:[])
//   .map(o=>({ id:String(o?.id||'').trim(), text:String(o?.text||'').trim(), media: cleanMedia(o?.media) }));

// function validatePayload(type, payload){
//   const out = {
//     type, 
//     prompt: String(payload.prompt||'').trim(),
//     explanation: payload.explanation!=null ? String(payload.explanation) : '',
//     points: payload.points!=null ? Math.max(0, toInt(payload.points,1)) : 1,
//     media: cleanMedia(payload.media),
//   };
//   if (!out.prompt) throw httpError(400,'Prompt is required');

//   if (type==='mcq' || type==='multi'){
//     const options = Array.isArray(payload.options) ? payload.options : [];
//     if (options.length<2) throw httpError(400,'Provide at least 2 options');
//     const ids = options.map(o=>String(o.id||'').trim());
//     if (new Set(ids).size !== ids.length) throw httpError(400,'Option ids must be unique');
//     const correct = Array.isArray(payload.correctOptionIds) ? payload.correctOptionIds.map(String) : [];
//     if (type==='mcq' && correct.length!==1) throw httpError(400,'MCQ requires exactly 1 correctOptionId');
//     if (type==='multi' && correct.length<1) throw httpError(400,'Multi requires at least 1 correctOptionId');
//     out.options = cleanOptions(options);
//     out.correctOptionIds = correct;
//   } else if (type==='boolean'){
//     if (typeof payload.correctBoolean !== 'boolean') throw httpError(400,'correctBoolean is required');
//     out.correctBoolean = payload.correctBoolean;
//   } else if (type==='short'){
//     const list = Array.isArray(payload.correctText) ? payload.correctText : [payload.correctText];
//     const cleaned = list.map(String).map(s=>s.trim()).filter(Boolean);
//     if (cleaned.length<1) throw httpError(400,'Provide at least one accepted answer');
//     out.correctText = cleaned;
//   } else {
//     throw httpError(400,'Invalid type');
//   }
//   return out;
// }

// function pickEditable(type, payload){
//   const out = {};
//   if (payload.prompt!=null) out.prompt = String(payload.prompt);
//   if (payload.points!=null) out.points = Math.max(0, toInt(payload.points,1));
//   if (payload.explanation!=null) out.explanation = String(payload.explanation);
//   if (payload.media!=null) out.media = cleanMedia(payload.media);

//   if (type==='mcq' || type==='multi'){
//     if (payload.options!=null){
//       const options = Array.isArray(payload.options) ? payload.options : [];
//       if (options.length<2) throw httpError(400,'Provide at least 2 options');
//       const ids = options.map(o=>String(o.id||'').trim());
//       if (new Set(ids).size !== ids.length) throw httpError(400,'Option ids must be unique');
//       out.options = cleanOptions(options);
//     }
//     if (payload.correctOptionIds!=null){
//       const ids = Array.isArray(payload.correctOptionIds) ? payload.correctOptionIds.map(String) : [];
//       if (type==='mcq' && ids.length!==1) throw httpError(400,'MCQ requires exactly 1 correctOptionId');
//       if (type==='multi' && ids.length<1) throw httpError(400,'Multi requires at least 1 correctOptionId');
//       out.correctOptionIds = ids;
//     }
//   } else if (type==='boolean'){
//     if (payload.correctBoolean!=null){
//       if (typeof payload.correctBoolean !== 'boolean') throw httpError(400,'correctBoolean must be boolean');
//       out.correctBoolean = payload.correctBoolean;
//     }
//   } else if (type==='short'){
//     if (payload.correctText!=null){
//       const list = Array.isArray(payload.correctText) ? payload.correctText : [payload.correctText];
//       const cleaned = list.map(String).map(s=>s.trim()).filter(Boolean);
//       if (cleaned.length<1) throw httpError(400,'Provide at least one accepted answer');
//       out.correctText = cleaned;
//     }
//   }
//   return out;
// }

// // APIs
// async function list({ instructorId, quizId }){
//   const quiz = await ensureOwnsQuiz(quizId, instructorId);
//   const items = await QuizQuestion.find({ quizId: quiz._id }).sort({ order:1, _id:1 }).lean();
//   return { items };
// }

// async function create({ instructorId, quizId, payload }){
//   const quiz = await ensureOwnsQuiz(quizId, instructorId);
//   const type = String(payload.type||'').trim();
//   const base = validatePayload(type, payload);

//   const count = await QuizQuestion.countDocuments({ quizId: quiz._id });
//   const order = payload.order!=null ? Math.max(0, toInt(payload.order, count)) : count;
//   if (order < count){
//     await QuizQuestion.updateMany({ quizId: quiz._id, order: { $gte: order } }, { $inc: { order: 1 } });
//   }
//   const doc = await QuizQuestion.create({ quizId: quiz._id, order, type, ...base });
//   return { question: doc };
// }

// async function update({ instructorId, questionId, payload }){
//   const q = await ensureOwnsQuestion(questionId, instructorId);
//   const patch = pickEditable(q.type, payload);
//   const updated = await QuizQuestion.findByIdAndUpdate(q._id, patch, { new:true, runValidators:true }).lean();
//   return { question: updated, updated: true };
// }

// async function reorder({ instructorId, questionId, toIndex }){
//   const q = await ensureOwnsQuestion(questionId, instructorId);
//   const count = await QuizQuestion.countDocuments({ quizId: q.quizId });
//   let target = Math.max(0, Math.min(count-1, toInt(toIndex, q.order)));
//   if (target === q.order) return { question: { id: q._id, order: q.order }, reordered: false };

//   if (target > q.order){
//     await QuizQuestion.updateMany(
//       { quizId: q.quizId, order: { $gt: q.order, $lte: target } },
//       { $inc: { order: -1 } }
//     );
//   } else {
//     await QuizQuestion.updateMany(
//       { quizId: q.quizId, order: { $gte: target, $lt: q.order } },
//       { $inc: { order: 1 } }
//     );
//   }
//   const updated = await QuizQuestion.findByIdAndUpdate(q._id, { order: target }, { new:true }).lean();
//   return { question: updated, reordered: true };
// }

// async function destroy({ instructorId, questionId }){
//   const q = await ensureOwnsQuestion(questionId, instructorId);
//   await QuizQuestion.deleteOne({ _id: q._id });
//   await QuizQuestion.updateMany(
//     { quizId: q.quizId, order: { $gt: q.order } },
//     { $inc: { order: -1 } }
//   );
//   return { deleted: true, questionId };
// }

// module.exports = { list, create, update, reorder, destroy };


// src/services/instructorQuizQuestion.service.js
const { Types } = require('mongoose');
const Quiz = require('../models/Quiz');
const QuizQuestion = require('../models/QuizQuestion');
const Course = require('../models/Course');

const isObjId = (v)=>Types.ObjectId.isValid(v);
const toInt = (v, def=0)=> (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def);
function httpError(s,m){ const e=new Error(m); e.status=s; return e; }

async function ensureOwnsQuiz(quizId, instructorId){
  if (!isObjId(quizId)) throw httpError(400,'Invalid quiz id');
  const quiz = await Quiz.findById(quizId).lean();
  if (!quiz) throw httpError(404,'Quiz not found');

  if (quiz.courseId) {
    const course = await Course.findById(quiz.courseId).lean();
    if (!course) throw httpError(404,'Parent course missing');
    if (!instructorId || String(course.instructorId)!==String(instructorId)) throw httpError(403,'Not allowed');
  } else {
    if (!instructorId) throw httpError(403,'Not allowed');
  }
  return quiz;
}

async function ensureOwnsQuestion(questionId, instructorId){
  if (!isObjId(questionId)) throw httpError(400,'Invalid question id');
  const q = await QuizQuestion.findById(questionId).lean();
  if (!q) throw httpError(404,'Question not found');
  await ensureOwnsQuiz(q.quizId, instructorId);
  return q;
}

const cleanMedia = (list) => (Array.isArray(list)?list:[])
  .map(m=>({ kind: (m?.kind==='audio'||m?.kind==='video')?m.kind:'image', url:String(m?.url||'').trim(), alt:String(m?.alt||'') }))
  .filter(m=>!!m.url);

function genOptId() { return Math.random().toString(36).slice(2, 8); }

const cleanOptions = (options) => (Array.isArray(options)?options:[])
  .map(o=>{
    // accept {id,text} OR {value,label}
    const id = String((o?.id ?? o?.value ?? '')).trim() || genOptId();
    const text = String((o?.text ?? o?.label ?? '')).trim();
    return { id, text, media: cleanMedia(o?.media) };
  })
  .filter(o=>!!o.text); // drop blanks

function validatePayload(type, payload){
  const out = {
    type, 
    prompt: String(payload.prompt||'').trim(),
    explanation: payload.explanation!=null ? String(payload.explanation) : '',
    points: payload.points!=null ? Math.max(0, toInt(payload.points,1)) : 1,
    media: cleanMedia(payload.media),
  };
  if (!out.prompt) throw httpError(400,'Prompt is required');

  if (type==='mcq' || type==='multi'){
    const options = cleanOptions(payload.options);
    if (options.length<2) throw httpError(400,'Provide at least 2 options with non-empty text');
    const ids = options.map(o=>o.id);
    if (new Set(ids).size !== ids.length) throw httpError(400,'Option ids must be unique');
    const incoming = Array.isArray(payload.correctOptionIds) ? payload.correctOptionIds : [payload.correctOptionIds];
    const correct = incoming.map(String).map(s=>s.trim()).filter(id=>ids.includes(id));
    if (type==='mcq' && correct.length!==1) throw httpError(400,'MCQ requires exactly 1 correctOptionId');
    if (type==='multi' && correct.length<1) throw httpError(400,'Multi requires at least 1 correctOptionId');
    out.options = options;
    out.correctOptionIds = correct;
  } else if (type==='boolean'){
    if (typeof payload.correctBoolean !== 'boolean') throw httpError(400,'correctBoolean is required');
    out.correctBoolean = payload.correctBoolean;
  } else if (type==='short'){
    const list = Array.isArray(payload.correctText) ? payload.correctText : [payload.correctText];
    const cleaned = list.map(String).map(s=>s.trim()).filter(Boolean);
    if (cleaned.length<1) throw httpError(400,'Provide at least one accepted answer');
    out.correctText = cleaned;
  } else {
    throw httpError(400,'Invalid type');
  }
  return out;
}

function pickEditable(type, payload){
  const out = {};
  if (payload.prompt!=null) out.prompt = String(payload.prompt);
  if (payload.points!=null) out.points = Math.max(0, toInt(payload.points,1));
  if (payload.explanation!=null) out.explanation = String(payload.explanation);
  if (payload.media!=null) out.media = cleanMedia(payload.media);

  if (type==='mcq' || type==='multi'){
    if (payload.options!=null){
      const options = cleanOptions(payload.options);
      if (options.length<2) throw httpError(400,'Provide at least 2 options with non-empty text');
      const ids = options.map(o=>o.id);
      if (new Set(ids).size !== ids.length) throw httpError(400,'Option ids must be unique');
      out.options = options;
    }
    if (payload.correctOptionIds!=null){
      const incoming = Array.isArray(payload.correctOptionIds) ? payload.correctOptionIds : [payload.correctOptionIds];
      const ids = incoming.map(String).map(s=>s.trim());
      if (type==='mcq' && ids.length!==1) throw httpError(400,'MCQ requires exactly 1 correctOptionId');
      if (type==='multi' && ids.length<1) throw httpError(400,'Multi requires at least 1 correctOptionId');
      out.correctOptionIds = ids;
    }
  } else if (type==='boolean'){
    if (payload.correctBoolean!=null){
      if (typeof payload.correctBoolean !== 'boolean') throw httpError(400,'correctBoolean must be boolean');
      out.correctBoolean = payload.correctBoolean;
    }
  } else if (type==='short'){
    if (payload.correctText!=null){
      const list = Array.isArray(payload.correctText) ? payload.correctText : [payload.correctText];
      const cleaned = list.map(String).map(s=>s.trim()).filter(Boolean);
      if (cleaned.length<1) throw httpError(400,'Provide at least one accepted answer');
      out.correctText = cleaned;
    }
  }
  return out;
}

// APIs
async function list({ instructorId, quizId }){
  const quiz = await ensureOwnsQuiz(quizId, instructorId);
  const items = await QuizQuestion.find({ quizId: quiz._id }).sort({ order:1, _id:1 }).lean();
  return { items };
}

async function create({ instructorId, quizId, payload }){
  const quiz = await ensureOwnsQuiz(quizId, instructorId);
  const type = String(payload.type||'').trim();
  const base = validatePayload(type, payload);

  const count = await QuizQuestion.countDocuments({ quizId: quiz._id });
  const order = payload.order!=null ? Math.max(0, toInt(payload.order, count)) : count;
  if (order < count){
    await QuizQuestion.updateMany({ quizId: quiz._id, order: { $gte: order } }, { $inc: { order: 1 } });
  }
  const doc = await QuizQuestion.create({ quizId: quiz._id, order, type, ...base });
  return { question: doc };
}

async function update({ instructorId, questionId, payload }){
  const q = await ensureOwnsQuestion(questionId, instructorId);
  const patch = pickEditable(q.type, payload);

  // If caller updated options AND correctOptionIds, ensure correctness:
  if (patch.options && !patch.correctOptionIds && Array.isArray(q.correctOptionIds)) {
    const validIds = new Set(patch.options.map(o=>o.id));
    patch.correctOptionIds = q.correctOptionIds.filter(id => validIds.has(String(id)));
  }

  const updated = await QuizQuestion.findByIdAndUpdate(q._id, patch, { new:true, runValidators:true }).lean();
  return { question: updated, updated: true };
}

async function reorder({ instructorId, questionId, toIndex }){
  const q = await ensureOwnsQuestion(questionId, instructorId);
  const count = await QuizQuestion.countDocuments({ quizId: q.quizId });
  let target = Math.max(0, Math.min(count-1, toInt(toIndex, q.order)));
  if (target === q.order) return { question: { id: q._id, order: q.order }, reordered: false };

  if (target > q.order){
    await QuizQuestion.updateMany(
      { quizId: q.quizId, order: { $gt: q.order, $lte: target } },
      { $inc: { order: -1 } }
    );
  } else {
    await QuizQuestion.updateMany(
      { quizId: q.quizId, order: { $gte: target, $lt: q.order } },
      { $inc: { order: 1 } }
    );
  }
  const updated = await QuizQuestion.findByIdAndUpdate(q._id, { order: target }, { new:true }).lean();
  return { question: updated, reordered: true };
}

async function destroy({ instructorId, questionId }){
  const q = await ensureOwnsQuestion(questionId, instructorId);
  await QuizQuestion.deleteOne({ _id: q._id });
  await QuizQuestion.updateMany(
    { quizId: q.quizId, order: { $gt: q.order } },
    { $inc: { order: -1 } }
  );
  return { deleted: true, questionId };
}

module.exports = { list, create, update, reorder, destroy };
