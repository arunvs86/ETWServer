const mongoose = require('mongoose');
const Question = require('../models/DiscussionQuestion');
const Answer   = require('../models/DiscussionAnswer');
const Comment  = require('../models/DiscussionComment');

function uid(req) { return req.user?.id || req.user?._id; }
function isAdmin(req) { return req.user?.role === 'admin'; }
function isInstructor(req) { return req.user?.role === 'instructor'; }
function role(req) { return req.user?.role || 'student'; }
/** QUESTIONS **/
exports.createQuestion = async (req, res, next) => {
  try {
    const { title, body, courseId } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });

    const q = await Question.create({
        authorId: uid(req),
        courseId: courseId || null,
        title: title.trim(),
        body: body.trim(),
      });
    res.status(201).json(q);
  } catch (err) { next(err); }
};

exports.listQuestions = async (req, res, next) => {
  try {
    const { page=1, limit=20, courseId, tag, status, q, sort='newest', mine } = req.query;

    const filter = { isDeleted: false, isArchived: false };
    if (courseId) filter.courseId = courseId;
    if (status) filter.status = status;
    if (tag) filter.tags = tag.toLowerCase();
    if (mine === '1') filter.authorId = uid(req);
    if (q) filter.$text = { $search: q };

    const sortMap = {
      newest: { createdAt: -1 },
      votes: { 'upvotes.length': -1, createdAt: -1 },
      unanswered: { answersCount: 1, createdAt: -1 },
      active: { updatedAt: -1 },
    };
    const sortBy = sortMap[sort] || sortMap.newest;

    const docs = await Question.find(filter)
      .select('-__v')
      .sort(sortBy)
      .skip((+page-1) * (+limit))
      .limit(+limit)
      .lean();

    const total = await Question.countDocuments(filter);
    res.json({ page:+page, limit:+limit, total, items: docs });
  } catch (err) { next(err); }
};

exports.getQuestion = async (req, res, next) => {
  try {
    const qId = req.params.id;
    const q = await Question.findById(qId)
      .populate('authorId', 'name')        // <- add
      .lean();
    if (!q || q.isDeleted) return res.status(404).json({ error: 'Question not found' });

    // bump views async
    Question.updateOne({ _id: q._id }, { $inc: { viewsCount: 1 } }).exec();

    const answers = await Answer.find({ questionId: q._id, isDeleted: false })
      .sort({ isAccepted: -1, createdAt: 1 })
      .populate('authorId', 'name role')   // <- add
      .lean();

    const comments = await Comment.find({ questionId: q._id, isDeleted: false })
      .sort({ createdAt: 1 })
      .populate('authorId', 'name role')   // <- add
      .lean();

    res.json({ question: q, answers, comments });
  } catch (err) { next(err); }
};

exports.editQuestion = async (req, res, next) => {
  try {
    const qId = req.params.id;
    const q = await Question.findById(qId);
    if (!q || q.isDeleted) return res.status(404).json({ error: 'Question not found' });

    if (!q.canEdit(req.user)) return res.status(403).json({ error: 'Not allowed' });

    const { title, body, status } = req.body || {};
    if (title) q.title = title.trim();
    if (body) q.body = body.trim();
    if (status && ['open','answered','closed','locked'].includes(status)) q.status = status;


    await q.save();
    res.json(q);
  } catch (err) { next(err); }
};

exports.toggleUpvoteQuestion = async (req, res, next) => {
  try {
    const q = await Question.findById(req.params.id);
    if (!q || q.isDeleted) return res.status(404).json({ error: 'Question not found' });
    await q.toggleUpvote(uid(req));
    res.json({ ok: true, upvotes: q.upvotes.length });
  } catch (err) { next(err); }
};

exports.closeOrLockQuestion = async (req, res, next) => {
  try {
    const q = await Question.findById(req.params.id);
    if (!q || q.isDeleted) return res.status(404).json({ error: 'Question not found' });

    if (!(isAdmin(req) || isInstructor(req))) {
      return res.status(403).json({ error: 'Only instructors/admins can close/lock' });
    }
    const { mode = 'closed' } = req.body || {};
    if (!['closed','locked'].includes(mode)) return res.status(400).json({ error: 'mode must be closed|locked' });
    q.status = mode;
    await q.save();
    res.json(q);
  } catch (err) { next(err); }
};

/** ANSWERS **/
exports.createAnswer = async (req, res, next) => {
  try {
    const questionId = req.params.id;

    // 1) validate ObjectId
    if (!mongoose.isValidObjectId(questionId)) {
      return res.status(400).json({ error: 'Invalid question id' });
    }

    // 2) enforce role here too (even if route has middleware),
    //    so we never bubble weird errors
    if (!['instructor','admin'].includes(role(req))) {
      return res.status(403).json({ error: 'Only instructors/admins can answer' });
    }

    // 3) load question
    const q = await Question.findById(questionId);
    if (!q || q.isDeleted) return res.status(404).json({ error: 'Question not found' });
    if (q.status === 'locked') return res.status(423).json({ error: 'Question is locked' }); // 423 Locked

    // 4) validate body
    const body = (req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Body is required' });

    // 5) create answer
    const a = await Answer.create({
      questionId: q._id,
      authorId: uid(req),
      body,
    });

    // 6) bump counters / status (fire & forget ok, but await to keep order)
    await Question.updateOne(
      { _id: q._id },
      { $inc: { answersCount: 1 }, $set: { status: 'open' } }
    );

    return res.status(201).json(a);
  } catch (err) {
    // Log and pass to error handler
    console.error('createAnswer error:', err);
    next(err);
  }
};

exports.editAnswer = async (req, res, next) => {
  try {
    const a = await Answer.findById(req.params.answerId);
    if (!a || a.isDeleted) return res.status(404).json({ error: 'Answer not found' });
    if (!a.canEdit(req.user)) return res.status(403).json({ error: 'Not allowed' });

    const { body } = req.body || {};
    if (body) a.body = String(body).trim();
    await a.save();
    res.json(a);
  } catch (err) { next(err); }
};

exports.deleteAnswer = async (req, res, next) => {
  try {
    const a = await Answer.findById(req.params.answerId);
    if (!a || a.isDeleted) return res.status(404).json({ error: 'Answer not found' });
    if (!a.canEdit(req.user)) return res.status(403).json({ error: 'Not allowed' });

    a.isDeleted = true;
    await a.save();

    await Question.updateOne({ _id: a.questionId }, { $inc: { answersCount: -1 } });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

exports.toggleUpvoteAnswer = async (req, res, next) => {
  try {
    const a = await Answer.findById(req.params.answerId);
    if (!a || a.isDeleted) return res.status(404).json({ error: 'Answer not found' });
    await a.toggleUpvote(uid(req));
    res.json({ ok: true, upvotes: a.upvotes.length });
  } catch (err) { next(err); }
};

exports.acceptAnswer = async (req, res, next) => {
  try {
    const questionId = req.params.id;
    const answerId = req.params.answerId;

    const q = await Question.findById(questionId);
    if (!q || q.isDeleted) return res.status(404).json({ error: 'Question not found' });
    if (String(q.authorId) !== String(uid(req)) && !isAdmin(req)) {
      return res.status(403).json({ error: 'Only the question author or admin can accept an answer' });
    }

    const a = await Answer.findById(answerId);
    if (!a || a.isDeleted || String(a.questionId) !== String(q._id)) {
      return res.status(404).json({ error: 'Answer not found' });
    }

    // unaccept previous
    await Answer.updateMany({ questionId: q._id, isAccepted: true }, { $set: { isAccepted: false } });
    a.isAccepted = true;
    await a.save();

    q.acceptedAnswerId = a._id;
    q.status = 'answered';
    await q.save();

    res.json({ ok: true, acceptedAnswerId: a._id });
  } catch (err) { next(err); }
};

/** COMMENTS (only question author can comment on their own question) **/
exports.addComment = async (req, res, next) => {
  try {
    const questionId = req.params.id;
    const q = await Question.findById(questionId);
    if (!q || q.isDeleted) return res.status(404).json({ error: 'Question not found' });

    if (String(q.authorId) !== String(uid(req)) && !isAdmin(req)) {
      return res.status(403).json({ error: 'Only the question author can comment here' });
    }

    const { body } = req.body || {};
    if (!body) return res.status(400).json({ error: 'Body is required' });

    const c = await Comment.create({
      questionId: q._id,
      authorId: uid(req),
      body: String(body).trim(),
    });
    res.status(201).json(c);
  } catch (err) { next(err); }
};

exports.deleteComment = async (req, res, next) => {
  try {
    const commentId = req.params.commentId;
    const c = await Comment.findById(commentId);
    if (!c || c.isDeleted) return res.status(404).json({ error: 'Comment not found' });

    const isOwner = String(c.authorId) === String(uid(req));
    if (!(isOwner || isAdmin(req))) return res.status(403).json({ error: 'Not allowed' });

    c.isDeleted = true;
    await c.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
};
