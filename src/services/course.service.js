// src/services/course.service.js
const { Types } = require('mongoose');
const Course = require('../models/Course');

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const CURRENCIES = ['GBP', 'USD', 'EUR'];

function toInt(n, def, { min = 1, max = 50 } = {}) {
  const v = parseInt(n, 10);
  if (Number.isNaN(v)) return def;
  return Math.max(min, Math.min(max, v));
}
function toBool(v) {
  if (v === true || v === false) return v;
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return undefined;
}
function toMinor(priceMajor) {
  const n = Number(priceMajor);
  if (Number.isNaN(n)) return undefined;
  return Math.max(0, Math.round(n * 100));
}
function parseTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter(Boolean).map(t => String(t).trim()).filter(Boolean);
  return String(tags).split(',').map(s => s.trim()).filter(Boolean);
}
function escapeRegExp(s) {
  return s ? s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
}
function sortFromKey(key) {
  switch (key) {
    case 'newest':     return { publishedAt: -1, _id: -1 };
    case 'rating':     return { ratingAvg: -1, ratingCount: -1 };
    case 'price_asc':  return { 'pricing.amountMinor': 1 };
    case 'price_desc': return { 'pricing.amountMinor': -1 };
    case 'popular':    return { enrollmentCount: -1, ratingCount: -1 };
    default:           return { publishedAt: -1, _id: -1 };
  }
}

function buildQuery(raw, { useText = true } = {}) {
  const query = { status: 'published' };

  const {
    q,
    category,
    level,
    language,
    tags,
    instructorId,
    isFree,
    priceMin,
    priceMax,
    ratingMin,
    durationMinSec,
    durationMaxSec,
    currency,
  } = raw;

  // search
  if (q && q.trim()) {
    if (useText) {
      query.$text = { $search: q.trim() };
    } else {
      const rx = new RegExp(escapeRegExp(q.trim()), 'i');
      query.$or = [{ title: rx }, { description: rx }];
    }
  }

  if (category) query.category = category;
  if (LEVELS.includes(level)) query.level = level;
  if (language) query.language = language;

  const tagList = parseTags(tags);
  if (tagList.length) query.tags = { $in: tagList };

  if (instructorId && Types.ObjectId.isValid(instructorId)) {
    query.instructorId = new Types.ObjectId(instructorId);
  }

  const isFreeBool = toBool(isFree);
  if (typeof isFreeBool === 'boolean') {
    query['pricing.isFree'] = isFreeBool;
  }

  if (currency && CURRENCIES.includes(currency)) {
    query['pricing.currency'] = currency;
  }

  // price range (major → minor)
  const pmin = toMinor(priceMin);
  const pmax = toMinor(priceMax);
  if (pmin !== undefined || pmax !== undefined) {
    query['pricing.amountMinor'] = {};
    if (pmin !== undefined) query['pricing.amountMinor'].$gte = pmin;
    if (pmax !== undefined) query['pricing.amountMinor'].$lte = pmax;
  }

  // rating floor
  const rmin = ratingMin != null ? Number(ratingMin) : undefined;
  if (!Number.isNaN(rmin) && rmin !== undefined) {
    query.ratingAvg = { $gte: rmin };
  }

  // duration bounds (seconds)
  const dmin = durationMinSec != null ? Number(durationMinSec) : undefined;
  const dmax = durationMaxSec != null ? Number(durationMaxSec) : undefined;
  if ((!Number.isNaN(dmin) && dmin !== undefined) || (!Number.isNaN(dmax) && dmax !== undefined)) {
    query.totalDurationSec = {};
    if (!Number.isNaN(dmin) && dmin !== undefined) query.totalDurationSec.$gte = dmin;
    if (!Number.isNaN(dmax) && dmax !== undefined) query.totalDurationSec.$lte = dmax;
  }

  return query;
}

async function listCourses(filters = {}) {
  const page  = toInt(filters.page, 1,  { min: 1, max: 1_000_000 });
  const limit = toInt(filters.limit, 12, { min: 1, max: 50 });
  const skip  = (page - 1) * limit;

  const projection =
    'title slug subtitle thumbnail pricing level language category tags ' +
    'ratingAvg ratingCount enrollmentCount totalDurationSec publishedAt';

  const sortSpec = sortFromKey(filters.sort);

  // Try with text search; if index missing, fallback to regex
  const queryText = buildQuery(filters, { useText: true });

  try {
    const [items, total] = await Promise.all([
      Course.find(queryText).select(projection).sort(sortSpec).skip(skip).limit(limit).lean(),
      Course.countDocuments(queryText),
    ]);
    return {
      items,
      meta: { page, limit, total, hasNextPage: page * limit < total },
    };
  } catch (err) {
    // Mongo error code 27: IndexNotFound for $text queries (older servers); string includes 'text index required'
    const needsFallback =
      err?.code === 27 ||
      /text index required|no text index/i.test(String(err?.message || ''));

    if (!needsFallback) throw err;

    const queryRegex = buildQuery(filters, { useText: false });
    const [items, total] = await Promise.all([
      Course.find(queryRegex).select(projection).sort(sortSpec).skip(skip).limit(limit).lean(),
      Course.countDocuments(queryRegex),
    ]);
    return {
      items,
      meta: { page, limit, total, hasNextPage: page * limit < total },
    };
  }
}

async function getCourseBySlug(slug) {
  if (!slug || typeof slug !== 'string') return null;

  const projection =
    'title slug subtitle description thumbnail promoVideoUrl pricing level ' +
    'language category tags ratingAvg ratingCount enrollmentCount totalDurationSec ' +
    'publishedAt updatedAt';

  const course = await Course.findOne({ slug, status: 'published' })
    .select(projection)
    .lean();

  return course || null;
}

module.exports = { listCourses, getCourseBySlug };
