const { Types } = require('mongoose');
const User = require('../models/User');
const InstructorApplication = require('../models/InstructorApplication');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

function normalizeList(x) {
  if (!x) return [];
  return (Array.isArray(x) ? x : String(x).split(','))
    .map(String).map(s => s.trim()).filter(Boolean);
}

function validateApply(body = {}) {
  const displayName = String(body.displayName || '').trim();
  const bio         = String(body.bio || '').trim();
  const agreeTerms  = Boolean(body.agreeTerms);
  if (displayName.length < 2) throw httpError(400, 'Display name must be at least 2 characters.');
  if (bio.length < 30)        throw httpError(400, 'Bio must be at least 30 characters.');
  if (!agreeTerms)            throw httpError(400, 'You must agree to the Instructor Terms.');
  const website    = body.website ? String(body.website).trim() : '';
  const links      = normalizeList(body.links);
  const categories = normalizeList(body.categories);
  const samples    = normalizeList(body.samples);
  return { displayName, bio, website, links, categories, samples, agreeTerms };
}

async function apply({ userId, payload }) {
  if (!userId) throw httpError(401, 'Auth required test');

  const user = await User.findById(userId).lean();
  if (!user) throw httpError(404, 'User not found');

  if (user.role === 'instructor') {
    throw httpError(409, 'Already an instructor.');
  }

  // If there is an existing PENDING app, block
  const existingPending = await InstructorApplication.findOne({ userId, status: 'pending' }).lean();
  if (existingPending) throw httpError(409, 'An application is already pending.');

  const answers = validateApply(payload);

  const app = await InstructorApplication.create({
    userId,
    status: 'pending',
    answers,
  });

  return {
    application: {
      id: app._id,
      status: app.status,
      answers: app.answers,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    }
  };
}

async function getMyApplication({ userId }) {
    console.log("userid:", userId)
  if (!userId) throw httpError(401, 'Auth required');
  const app = await InstructorApplication.findOne({ userId })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  return { application: app ? {
    id: app._id,
    status: app.status,
    answers: app.answers,
    review: app.review,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  } : null };
}

module.exports = { apply, getMyApplication };
