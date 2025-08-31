const { Types } = require('mongoose');
const Resource = require('../models/Resource');
const ResourceItem = require('../models/ResourceItem');
const ResourceAccess = require('../models/ResourceAccess');
const Membership = require('../models/Membership');

function toInt(n, def, { min = 1, max = 50 } = {}) {
  const v = parseInt(n, 10);
  if (Number.isNaN(v)) return def;
  return Math.max(min, Math.min(max, v));
}

function isMemberActive(mem) {
  if (!mem) return false;
  const now = new Date();
  return (mem.status === 'active' || mem.status === 'trialing') &&
         now >= mem.currentPeriodStart && now < mem.currentPeriodEnd;
}


function escapeRegExp(s) { return s ? s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''; }
function sortFromKey(key) {
  switch (key) {
    case 'newest': return { publishedAt: -1, _id: -1 };
    default: return { publishedAt: -1, _id: -1 };
  }
}
function buildQuery(raw, { useText = true } = {}) {
  const query = { status: 'published' };
  const { q, category } = raw || {};
  if (q && q.trim()) {
    if (useText) query.$text = { $search: q.trim() };
    else {
      const rx = new RegExp(escapeRegExp(q.trim()), 'i');
      query.$or = [{ title: rx }, { description: rx }];
    }
  }
  if (category) query.category = String(category);
  return query;
}

exports.listResources = async (filters = {}) => {
  const page = toInt(filters.page, 1, { min: 1, max: 1_000_000 });
  const limit = toInt(filters.limit, 12, { min: 1, max: 50 });
  const skip = (page - 1) * limit;

  const projection = 'title slug description category thumbnail pricing publishedAt updatedAt';
  const sortSpec = sortFromKey(filters.sort);
  const qText = buildQuery(filters, { useText: true });

  try {
    const [items, total] = await Promise.all([
      Resource.find(qText).select(projection).sort(sortSpec).skip(skip).limit(limit).lean(),
      Resource.countDocuments(qText),
    ]);
    return { items, meta: { page, limit, total, hasNextPage: page * limit < total } };
  } catch (err) {
    const needsFallback = err?.code === 27 || /text index required|no text index/i.test(String(err?.message || ''));
    if (!needsFallback) throw err;
    const qRegex = buildQuery(filters, { useText: false });
    const [items, total] = await Promise.all([
      Resource.find(qRegex).select(projection).sort(sortSpec).skip(skip).limit(limit).lean(),
      Resource.countDocuments(qRegex),
    ]);
    return { items, meta: { page, limit, total, hasNextPage: page * limit < total } };
  }
};

exports.getBySlug = async (slug) => {
  if (!slug || typeof slug !== 'string') return null;

  const resource = await Resource.findOne({ slug, status: 'published' })
    .select('title slug description category thumbnail pricing publishedAt updatedAt')
    .lean();
  if (!resource) return null;

  const items = await ResourceItem.find({ resourceId: resource._id })
    .select('_id title order type link file')
    .sort({ order: 1, _id: 1 })
    .lean();

  return {
    resource,
    items: items.map((it) => ({
      id: it._id,
      title: it.title,
      type: it.type,
      order: it.order,
      link: it.type === 'link' ? it.link : undefined,
      file: it.type === 'file' ? it.file : undefined,
    })),
  };
};

async function getPublicResourceBySlug({ slug, userId }) {
  if (!slug) return null;

  const resDoc = await Resource.findOne({ slug, status: 'published' }).lean();
  if (!resDoc) return null;

  const priceMinor = resDoc.pricing?.amountMinor ?? 0;
  const isFree = priceMinor === 0;

  let unlocked = isFree;

  if (!unlocked && userId && Types.ObjectId.isValid(userId)) {
    // membership check
    try {
      if (resDoc.pricing?.includedInMembership) {
        const mem = await Membership.findOne({ userId }).lean();
        if (isMemberActive(mem)) unlocked = true;
      }
    } catch (e) { console.error('[RESOURCE] membership check failed', e); }

    // purchase check
    try {
      const acc = await ResourceAccess.findOne({ userId, resourceId: resDoc._id, status: 'active' }).lean();
      if (acc) unlocked = true;
    } catch (e) { console.error('[RESOURCE] access check failed', e); }
  }

  const items = unlocked
    ? await ResourceItem.find({ resourceId: resDoc._id }).select('_id title type order link file').sort({ order: 1 }).lean()
    : [];

  return {
    resource: {
      id: resDoc._id,
      slug: resDoc.slug,
      title: resDoc.title,
      description: resDoc.description,
      category: resDoc.category,
      thumbnail: resDoc.thumbnail,
      pricing: resDoc.pricing,
      publishedAt: resDoc.publishedAt,
      updatedAt: resDoc.updatedAt,
      unlocked,
    },
    items: items.map(i => ({
      id: i._id,
      title: i.title,
      type: i.type,
      order: i.order,
      link: i.type === 'link' ? i.link : undefined,
      file: i.type === 'file' ? i.file : undefined,
    })),
  };
}

module.exports = { getPublicResourceBySlug };
