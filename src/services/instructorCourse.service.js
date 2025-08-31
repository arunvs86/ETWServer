// src/services/instructorCourse.service.js
// Real DB logic for instructor course shell (create/update/publish/etc.)

const { Types } = require('mongoose');
const Course  = require('../models/Course');
const Section = require('../models/Section');
const Lesson  = require('../models/Lesson');

const LEVELS     = ['beginner', 'intermediate', 'advanced'];
const CURRENCIES = ['GBP', 'USD', 'EUR'];

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function toMinor(amountMajor) {
  if (amountMajor == null) return undefined;
  const n = Number(amountMajor);
  if (Number.isNaN(n)) return undefined;
  return Math.max(0, Math.round(n * 100));
}

function normalizeTags(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(String).map(s => s.trim()).filter(Boolean);
  return String(input).split(',').map(s => s.trim()).filter(Boolean);
}

function pickBasics(payload = {}) {
  const out = {};
  if (payload.title != null) out.title = String(payload.title).trim();
  if (payload.subtitle != null) out.subtitle = String(payload.subtitle);
  if (payload.description != null) out.description = String(payload.description);
  if (payload.language != null) out.language = String(payload.language);
  if (payload.level && LEVELS.includes(payload.level)) out.level = payload.level;
  if (payload.category != null) out.category = String(payload.category);
  if (payload.tags != null) out.tags = normalizeTags(payload.tags);
  if (payload.promoVideoUrl != null) out.promoVideoUrl = String(payload.promoVideoUrl);
  if (payload.thumbnail != null) out.thumbnail = String(payload.thumbnail);
  return out;
}

async function ensureOwned(courseId, instructorId) {
  if (!Types.ObjectId.isValid(courseId)) throw httpError(400, 'Invalid course id');
  const course = await Course.findById(courseId);
  if (!course) throw httpError(404, 'Course not found');
  if (!instructorId || String(course.instructorId) !== String(instructorId)) {
    throw httpError(403, 'Not allowed');
  }
  return course;
}

/* ----------------------- Single-lesson helpers ----------------------- */

function isValidYouTubeUrl(url = '') {
  if (typeof url !== 'string') return false;
  const u = url.trim();
  // Accept youtube.com/watch?v=, youtu.be/, shorts/, embed/, nocookie
  const re = /^(https?:\/\/)?(www\.)?(youtube(-nocookie)?\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w\-]{6,}/i;
  return re.test(u);
}

async function getOrCreateDefaultSection(courseId) {
  let section = await Section.findOne({ courseId, order: 0 });
  if (!section) {
    section = await Section.create({
      courseId,
      title: 'Main',
      order: 0,
      // do NOT set archivedAt at all
    });
  }
  return section;
}

async function getDefaultSection(courseId) {
  return Section.findOne({ courseId, order: 0 });
}

async function getSingleLessonForCourse(courseId) {
  const sec = await getDefaultSection(courseId);
  if (!sec) return null;
  // No archivedAt filter: we want the first (and only) lesson regardless,
  // unless you later implement explicit archiving.
  return Lesson.findOne({ sectionId: sec._id }).sort({ order: 1 });
}

/**
 * Upsert the single lesson for a course.
 * Enforces type='video' and video.provider='youtube'.
 * payload: { title?, youtubeUrl (required), durationSec?, captions?, resources? }
 */
async function upsertSingleLesson({ instructorId, courseId, payload }) {
  const course = await ensureOwned(courseId, instructorId);
  // if (course.status === 'archived') throw httpError(400, 'Cannot edit an archived course');

  const youtubeUrl = String(payload.youtubeUrl || '').trim();
  if (!isValidYouTubeUrl(youtubeUrl)) throw httpError(400, 'Valid YouTube URL is required');

  const title = (payload.title != null && String(payload.title).trim().length > 0)
    ? String(payload.title).trim()
    : (course.title || 'Lesson 1');

  const durationSec = payload.durationSec != null ? Math.max(0, Number(payload.durationSec) || 0) : 0;
  const captions = Array.isArray(payload.captions) ? payload.captions : [];
  const resources = Array.isArray(payload.resources) ? payload.resources : [];

  const section = await getOrCreateDefaultSection(course._id);

  let lesson = await Lesson.findOne({ sectionId: section._id }).sort({ order: 1 });

  if (!lesson) {
    lesson = await Lesson.create({
      sectionId: section._id,
      title,
      order: 0,
      type: 'video',
      video: {
        provider: 'youtube',
        assetId: '',
        url: youtubeUrl,
        durationSec,
        captions,
      },
      resources,
      // do NOT set archivedAt at all
    });
  } else {
    lesson.title = title;
    lesson.type = 'video';
    lesson.video = {
      provider: 'youtube',
      assetId: '',
      url: youtubeUrl,
      durationSec,
      captions,
    };
    lesson.resources = resources;
    await lesson.save();
  }

  // Optional aggregate
  if (typeof course.totalDurationSec === 'number') {
    course.totalDurationSec = durationSec || course.totalDurationSec || 0;
    await course.save();
  }

  return {
    lesson: {
      id: lesson._id,
      title: lesson.title,
      type: lesson.type,
      video: lesson.video,
      resources: lesson.resources,
      order: lesson.order,
      updatedAt: lesson.updatedAt,
    },
  };
}

async function deleteSingleLesson({ instructorId, courseId }) {
  // validate ownership
  await ensureOwned(courseId, instructorId);
  const sec = await getDefaultSection(courseId);
  if (!sec) return { deleted: true };
  await Lesson.deleteMany({ sectionId: sec._id });
  return { deleted: true };
}

/* ----------------------- Core course services ----------------------- */

async function createDraftCourse({ instructorId, payload }) {
  if (!instructorId) throw httpError(401, 'Auth required');

  const basics = pickBasics(payload);
  if (!basics.title) throw httpError(400, 'Title is required');

  // Pricing is set via dedicated endpoint, but allow optional on create:
  let pricing;
  if (payload.amountMinor != null || payload.amountMajor != null || payload.currency) {
    const amountMinor =
      payload.amountMinor != null ? Number(payload.amountMinor) : toMinor(payload.amountMajor);
    const currency = payload.currency && CURRENCIES.includes(payload.currency)
      ? payload.currency
      : 'GBP';
    pricing = { amountMinor: Math.max(0, amountMinor || 0), currency };
  }

  const course = await Course.create({
    ...basics,
    instructorId,
    status: 'draft',
    publishedAt: null,
    archivedAt: null,
    ...(pricing ? { pricing } : {}),
  });

  // Auto-create/update single lesson if a youtubeUrl was provided
  if (payload.youtubeUrl) {
    await upsertSingleLesson({
      instructorId,
      courseId: course._id,
      payload: {
        title: payload.lessonTitle || course.title,
        youtubeUrl: payload.youtubeUrl,
        durationSec: payload.durationSec,
        captions: payload.captions,
        resources: payload.resources,
      },
    });
  }

  return {
    course: {
      id: course._id,
      title: course.title,
      slug: course.slug,
      status: course.status,
      pricing: course.pricing,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    },
  };
}

async function updateCourseBasics({ instructorId, courseId, payload }) {
  const course = await ensureOwned(courseId, instructorId);
  if (course.status === 'archived') throw httpError(400, 'Cannot edit an archived course');

  const updates = pickBasics(payload);
  Object.assign(course, updates);
  await course.save();

  return { course: {
    id: course._id,
    title: course.title,
    slug: course.slug,
    subtitle: course.subtitle,
    description: course.description,
    language: course.language,
    level: course.level,
    category: course.category,
    tags: course.tags,
    promoVideoUrl: course.promoVideoUrl,
    thumbnail: course.thumbnail,
    pricing: course.pricing,
    status: course.status,
    publishedAt: course.publishedAt,
    updatedAt: course.updatedAt,
  }};
}

async function updateCoursePricing({ instructorId, courseId, payload }) {
  const course = await ensureOwned(courseId, instructorId);
  if (course.status === 'archived') throw httpError(400, 'Cannot edit an archived course');

  // Accept amountMajor or amountMinor
  let amountMinor;
  if (payload.amountMinor != null) {
    const n = Number(payload.amountMinor);
    if (Number.isNaN(n) || n < 0) throw httpError(400, 'amountMinor must be >= 0');
    amountMinor = Math.round(n);
  } else {
    amountMinor = toMinor(payload.amountMajor ?? 0);
  }

  const currency = payload.currency || course.pricing?.currency || 'GBP';
  if (!CURRENCIES.includes(currency)) throw httpError(400, 'Invalid currency');

  course.pricing = {
    amountMinor,
    currency,
    // isFree recalculated by schema pre-validate
    isFree: course.pricing?.isFree,
  };

  await course.save();

  return { course: {
    id: course._id,
    pricing: course.pricing,
    updatedAt: course.updatedAt,
  }};
}

async function publishCourse({ instructorId, courseId }) {
  const course = await ensureOwned(courseId, instructorId);

  // If archived, auto-restore to draft so we can publish
  if (course.status === 'archived') {
    course.status = 'draft';
    course.archivedAt = null;
    // don't save yet; we will finalize below after validations
  }

  // Minimal validations to publish
  if (!course.title) throw httpError(400, 'Title required');
  if (!course.slug) throw httpError(400, 'Slug required');
  if (!course.language) throw httpError(400, 'Language required');
  if (!course.level) throw httpError(400, 'Level required');

  // Ensure pricing exists (even for free)
  if (!course.pricing || course.pricing.currency == null) {
    course.pricing = {
      amountMinor: course.pricing?.amountMinor ?? 0,
      currency: course.pricing?.currency ?? 'GBP',
      isFree: course.pricing?.isFree, // recalculated in pre-validate
    };
  }

  // Ensure there is one video lesson with a valid YouTube URL
  const singleLesson = await getSingleLessonForCourse(course._id);
  const isValidYouTube =
    singleLesson &&
    singleLesson.type === 'video' &&
    singleLesson.video?.provider === 'youtube' &&
    isValidYouTubeUrl(singleLesson.video?.url);

  if (!isValidYouTube) {
    throw httpError(400, 'Course must have a single YouTube video lesson before publishing');
  }

  // Finalize publish
  course.status = 'published';
  course.publishedAt = new Date();
  await course.save();

  return {
    ok: true,
    course: {
      id: course._id,
      slug: course.slug,
      status: course.status,
      publishedAt: course.publishedAt,
    },
  };
}

async function unpublishCourse({ instructorId, courseId }) {
  const course = await ensureOwned(courseId, instructorId);
  if (course.status === 'archived') throw httpError(400, 'Cannot unpublish an archived course');

  course.status = 'draft';
  course.publishedAt = null;
  await course.save();

  return { ok: true, course: { id: course._id, status: course.status, publishedAt: course.publishedAt } };
}

async function archiveCourse({ instructorId, courseId }) {
  const course = await ensureOwned(courseId, instructorId);
  course.status = 'archived';
  course.archivedAt = new Date();
  course.publishedAt = null;
  await course.save();

  return { ok: true, course: { id: course._id, status: course.status, archivedAt: course.archivedAt } };
}

async function restoreCourse({ instructorId, courseId }) {
  const course = await ensureOwned(courseId, instructorId);
  course.status = 'draft';
  course.archivedAt = null;
  await course.save();

  return { ok: true, course: { id: course._id, status: course.status, archivedAt: course.archivedAt } };
}

async function deleteCourse({ instructorId, courseId }) {
  const course = await ensureOwned(courseId, instructorId);
  if (course.status !== 'draft') throw httpError(400, 'Only draft courses can be deleted');

  // delete course first
  await course.deleteOne();

  // Cascade-delete default section + lesson(s)
  const sections = await Section.find({ courseId: courseId });
  const sectionIds = sections.map(s => s._id);
  await Promise.all([
    Lesson.deleteMany({ sectionId: { $in: sectionIds } }),
    Section.deleteMany({ _id: { $in: sectionIds } }),
  ]);

  return { deleted: true };
}

// ---------- LIST: my courses ----------
async function listMyCourses({ instructorId, status, q, page = 1, limit = 12 }) {
  if (!instructorId) throw httpError(401, 'Auth required');

  // sanitize paging
  page = Math.max(1, Number(page) || 1);
  limit = Math.min(50, Math.max(1, Number(limit) || 12));
  const skip = (page - 1) * limit;

  if (!Types.ObjectId.isValid(instructorId)) throw httpError(400, 'Invalid instructor id');
  const query = { instructorId: new Types.ObjectId(instructorId) };

  if (status && ['draft', 'published', 'archived'].includes(String(status))) {
    query.status = status;
  }

  const hasQ = q && String(q).trim().length > 0;
  const projection = hasQ
    ? { score: { $meta: 'textScore' }, title: 1, slug: 1, status: 1, pricing: 1, updatedAt: 1, publishedAt: 1, thumbnail: 1 }
    : { title: 1, slug: 1, status: 1, pricing: 1, updatedAt: 1, publishedAt: 1, thumbnail: 1 };

  if (hasQ) {
    query.$text = { $search: String(q).trim() };
  }

  const sort = hasQ
    ? { score: { $meta: 'textScore' }, updatedAt: -1 }
    : { updatedAt: -1 };

  const [items, total] = await Promise.all([
    Course.find(query, projection).sort(sort).skip(skip).limit(limit),
    Course.countDocuments(query),
  ]);

  return {
    items: items.map((c) => ({
      id: c._id,
      title: c.title,
      slug: c.slug,
      status: c.status,
      pricing: c.pricing,
      thumbnail: c.thumbnail,
      updatedAt: c.updatedAt,
      publishedAt: c.publishedAt,
    })),
    meta: {
      page,
      limit,
      total,
      hasNextPage: page * limit < total,
    },
  };
}

// ---------- GET: my single course ----------
async function getMyCourse({ instructorId, courseId }) {
  const course = await ensureOwned(courseId, instructorId);
  return {
    course: {
      id: course._id,
      title: course.title,
      slug: course.slug,
      subtitle: course.subtitle,
      description: course.description,
      language: course.language,
      level: course.level,
      category: course.category,
      tags: course.tags,
      thumbnail: course.thumbnail,
      promoVideoUrl: course.promoVideoUrl,
      pricing: course.pricing,
      status: course.status,
      publishedAt: course.publishedAt,
      updatedAt: course.updatedAt,
    },
  };
}

module.exports = {
  createDraftCourse,
  updateCourseBasics,
  updateCoursePricing,
  publishCourse,
  unpublishCourse,
  archiveCourse,
  restoreCourse,
  deleteCourse,
  listMyCourses,
  getMyCourse,

  // helpers used elsewhere
  upsertSingleLesson,
  deleteSingleLesson,
  getDefaultSection,
  getOrCreateDefaultSection,
  getSingleLessonForCourse,
};
