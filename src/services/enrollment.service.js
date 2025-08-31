// src/services/enrollment.service.js
const { Types } = require('mongoose');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Membership = require('../models/Membership');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const toInt = (v, def, { min = 1, max = 100 } = {}) => {
  const n = parseInt(v, 10); if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
};

function parseDate(d) {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t;
}

function isMembershipActive(mem) {
  if (!mem) return false;
  const now = new Date();
  const start = parseDate(mem.currentPeriodStart);
  const end   = parseDate(mem.currentPeriodEnd);
  const activeStatus = mem.status === 'active' || mem.status === 'trialing';
  return Boolean(activeStatus && start && end && now >= start && now < end);
}

async function createEnrollment({ userId, payload }) {
  if (!userId) throw httpError(401, 'Auth required');

  const { courseId } = payload || {};
  if (!Types.ObjectId.isValid(courseId)) throw httpError(400, 'Invalid courseId');

  const course = await Course.findById(courseId).lean();
  if (!course) throw httpError(404, 'Course not found');
  if (course.status !== 'published') throw httpError(400, 'Course not published');
  if (course.archivedAt) throw httpError(400, 'Course archived');

  const isFree = !!course?.pricing?.isFree;

  let via = 'purchase';
  let membershipId = undefined;

  if (!isFree) {
    // Be explicit: only consider active/trialing here to avoid stale mem objects
    const mem = await Membership.findOne({ userId }).lean();
    if (!isMembershipActive(mem)) {
      throw httpError(402, 'Membership required to enroll in paid courses');
    }
    via = 'membership';
    membershipId = mem && mem._id ? mem._id : undefined;
  }

  const now = new Date();

  // ---- Robust upsert: use updateOne to get upsertedId, then fetch the doc ----
  const res = await Enrollment.updateOne(
    { userId, courseId },
    {
      $setOnInsert: {
        userId,
        courseId,
        via,
        membershipId: membershipId || undefined,
        status: 'active',
        activatedAt: now,
        expiresAt: null,
      },
    },
    { upsert: true }
  );

  // If this was a new insert, res.upsertedId will be set (MongoDB driver behavior)
  const wasInserted =
    (res && ('upsertedCount' in res ? res.upsertedCount > 0 : false)) ||
    (res && res.upsertedId != null);

  // Always fetch the current enrollment document to return a stable shape
  const doc = await Enrollment.findOne({ userId, courseId }).lean();
  if (!doc) throw httpError(500, 'Enrollment upsert succeeded but document not found');

  if (wasInserted) {
    await Course.updateOne({ _id: courseId }, { $inc: { enrollmentCount: 1 } });
  }

  const courseCard = {
    id: String(course._id),
    title: course.title,
    slug: course.slug,
    thumbnail: course.thumbnail,
    pricing: course.pricing,
    level: course.level,
    language: course.language,
    category: course.category,
    ratingAvg: course.ratingAvg,
    ratingCount: course.ratingCount,
    enrollmentCount: course.enrollmentCount + (wasInserted ? 1 : 0),
    totalDurationSec: course.totalDurationSec,
    publishedAt: course.publishedAt,
  };

  return {
    enrollment: {
      id: doc._id,
      userId: doc.userId,
      courseId: doc.courseId,
      via: doc.via,
      membershipId: doc.membershipId || null,
      status: doc.status,
      activatedAt: doc.activatedAt,
      expiresAt: doc.expiresAt || null,
      course: courseCard,
    },
  };
}

async function listMyEnrollments({ userId, page = 1, limit = 12 }) {
  if (!userId) throw httpError(401, 'Auth required');
  const p = toInt(page, 1, { min: 1, max: 1_000_000 });
  const l = toInt(limit, 12, { min: 1, max: 50 });
  const skip = (p - 1) * l;
  const uid = new Types.ObjectId(String(userId));

  const [rows, total] = await Promise.all([
    Enrollment.aggregate([
      { $match: { userId: uid } },
      { $sort: { activatedAt: -1, _id: -1 } },
      { $skip: skip },
      { $limit: l },
      { $lookup: { from: 'courses', localField: 'courseId', foreignField: '_id', as: 'course' } },
      { $unwind: '$course' },
      {
        $project: {
          via: 1, status: 1, activatedAt: 1, expiresAt: 1, courseId: 1,
          course: {
            _id: 1, title: 1, slug: 1, thumbnail: 1, pricing: 1,
            level: 1, language: 1, category: 1,
            ratingAvg: 1, ratingCount: 1, enrollmentCount: 1,
            totalDurationSec: 1, publishedAt: 1,
          }
        }
      },
    ]),
    Enrollment.countDocuments({ userId: uid }),
  ]);

  const items = rows.map(r => ({
    enrollmentId: r._id,
    courseId: r.courseId,
    via: r.via,
    status: r.status,
    activatedAt: r.activatedAt,
    expiresAt: r.expiresAt || null,
    course: {
      id: String(r.course._id),
      title: r.course.title,
      slug: r.course.slug,
      thumbnail: r.course.thumbnail,
      pricing: r.course.pricing,
      level: r.course.level,
      language: r.course.language,
      category: r.course.category,
      ratingAvg: r.course.ratingAvg,
      ratingCount: r.course.ratingCount,
      enrollmentCount: r.course.enrollmentCount,
      totalDurationSec: r.course.totalDurationSec,
      publishedAt: r.course.publishedAt,
    },
  }));

  return { items, meta: { page: p, limit: l, total, hasNextPage: p * l < total } };
}

module.exports = { createEnrollment, listMyEnrollments };
