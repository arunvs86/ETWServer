// src/services/adminInstructor.service.js
const mongoose = require('mongoose');
const { Types } = require('mongoose');

const User = require('../models/User');
const InstructorProfile = require('../models/InstructorProfile'); // Phase 0 model
const InstructorApplication = require('../models/InstructorApplication');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const toInt = (v, d, { min = 1, max = 100 } = {}) =>
  Math.max(min, Math.min(max, Number.isFinite(+v) ? Math.trunc(+v) : d));

const isObjId = (v) => Types.ObjectId.isValid(v);
const isTxnNotAllowed = (err) => /Transaction numbers are only allowed|Transaction.*not supported/i.test(String(err?.message || ''));

function shape(app) {
  return {
    id: app._id,
    status: app.status,
    answers: app.answers,
    review: app.review,
    user: app.user
      ? { id: app.user._id, name: app.user.name, email: app.user.email, role: app.user.role }
      : undefined,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

/* ---------------------------------- List ---------------------------------- */

async function listApplications({ status, q, page = 1, limit = 20 }) {
  const match = {};
  if (status && ['pending', 'approved', 'rejected'].includes(status)) match.status = status;

  const pipeline = [
    { $match: match },
    { $sort: { createdAt: -1, _id: -1 } },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
  ];

  if (q && String(q).trim()) {
    const rx = new RegExp(String(q).trim(), 'i');
    pipeline.push({ $match: { $or: [{ 'user.email': rx }, { 'user.name': rx }, { 'answers.displayName': rx }] } });
  }

  const pageN = toInt(page, 1, { min: 1, max: 1_000_000 });
  const limitN = toInt(limit, 20, { min: 1, max: 50 });
  const skip = (pageN - 1) * limitN;

  const [facet] = await InstructorApplication.aggregate([
    ...pipeline,
    { $facet: { items: [{ $skip: skip }, { $limit: limitN }], total: [{ $count: 'n' }] } },
  ]);

  const items = (facet?.items || []).map((a) => ({
    ...shape(a),
    user: { id: a.user._id, name: a.user.name, email: a.user.email, role: a.user.role },
  }));
  const total = facet?.total?.[0]?.n || 0;

  return { items, meta: { page: pageN, limit: limitN, total, hasNextPage: pageN * limitN < total } };
}

/* ---------------------------------- Get One -------------------------------- */

async function getApplicationById({ id }) {
  if (!isObjId(id)) throw httpError(400, 'Invalid id');

  const app = await InstructorApplication.findById(id)
    .populate('userId', 'name email role')
    .lean();

  if (!app) throw httpError(404, 'Application not found');

  return {
    application: {
      id: app._id,
      status: app.status,
      answers: app.answers,
      review: app.review,
      user: { id: app.userId._id, name: app.userId.name, email: app.userId.email, role: app.userId.role },
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    },
  };
}

/* --------------------------------- Approve --------------------------------- */

async function approve({ adminId, id }) {
  if (!isObjId(id)) throw httpError(400, 'Invalid id');

  // First try with a transaction (best for prod replica sets)
  let session;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const app = await InstructorApplication.findOne({ _id: id, status: 'pending' }).session(session);
      if (!app) throw httpError(404, 'Application not found or not pending');

      const user = await User.findById(app.userId).session(session);
      if (!user) throw httpError(404, 'User not found');

      user.role = 'instructor';
      await user.save({ session });

      const a = app.answers || {};
      await InstructorProfile.findOneAndUpdate(
        { userId: user._id },
        {
          userId: user._id,
          displayName: a.displayName || user.name || (user.email && user.email.split('@')[0]) || 'Instructor',
          bio: a.bio || '',
          website: a.website || '',
          links: Array.isArray(a.links) ? a.links : [],
          categories: Array.isArray(a.categories) ? a.categories : [],
          avatar: user.avatar || '',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session }
      );

      app.status = 'approved';
      app.review = { ...(app.review || {}), reviewedBy: adminId || undefined, reviewedAt: new Date() };
      await app.save({ session });
    });
    session.endSession();
    return { ok: true, application: { id, status: 'approved' } };
  } catch (e) {
    if (session) session.endSession();
    if (!isTxnNotAllowed(e)) throw e;

    // Fallback for standalone Mongo (no transactions)
    const app = await InstructorApplication.findOne({ _id: id });
    if (!app) throw httpError(404, 'Application not found');
    if (app.status !== 'pending') throw httpError(400, 'Application is not pending');

    const user = await User.findById(app.userId);
    if (!user) throw httpError(404, 'User not found');

    // 1) Promote user (idempotent)
    await User.updateOne({ _id: user._id }, { $set: { role: 'instructor' } });

    // 2) Upsert profile
    const a = app.answers || {};
    await InstructorProfile.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        displayName: a.displayName || user.name || (user.email && user.email.split('@')[0]) || 'Instructor',
        bio: a.bio || '',
        website: a.website || '',
        links: Array.isArray(a.links) ? a.links : [],
        categories: Array.isArray(a.categories) ? a.categories : [],
        avatar: user.avatar || '',
      },
      { upsert: true, new: false, setDefaultsOnInsert: true }
    );

    // 3) Mark approved (guard ensures idempotence)
    await InstructorApplication.updateOne(
      { _id: id, status: 'pending' },
      { $set: { status: 'approved', review: { ...(app.review || {}), reviewedBy: adminId || undefined, reviewedAt: new Date() } } }
    );

    const approved = await InstructorApplication.findById(id).lean();
    return { ok: true, application: { id: approved._id, status: approved.status, reviewedAt: approved.review?.reviewedAt } };
  }
}

/* ---------------------------------- Reject --------------------------------- */

async function reject({ adminId, id, reason }) {
  if (!isObjId(id)) throw httpError(400, 'Invalid id');

  const app = await InstructorApplication.findById(id);
  if (!app) throw httpError(404, 'Application not found');
  if (app.status !== 'pending') throw httpError(400, 'Application is not pending');

  app.status = 'rejected';
  app.review = {
    ...(app.review || {}),
    reason: String(reason || '').trim(),
    reviewedBy: adminId || undefined,
    reviewedAt: new Date(),
  };
  await app.save();

  return { ok: true, application: { id: app._id, status: app.status, review: app.review } };
}

/* -------------------------------- Update Notes ----------------------------- */

async function updateNotes({ id, notes }) {
  if (!isObjId(id)) throw httpError(400, 'Invalid id');

  const app = await InstructorApplication.findByIdAndUpdate(
    id,
    { $set: { 'review.notes': String(notes || '') } },
    { new: true }
  ).lean();

  if (!app) throw httpError(404, 'Application not found');

  return { application: { id: app._id, review: app.review } };
}

module.exports = {
  listApplications,
  getApplicationById,
  approve,
  reject,
  updateNotes,
};
