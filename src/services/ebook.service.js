const { Types } = require('mongoose');
const Ebook = require('../models/Ebook');
const EbookItem = require('../models/EbookItem');
const EbookAccess = require('../models/EbookAccess');
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
    case 'newest': default: return { publishedAt: -1, _id: -1 };
  }
}

function buildQuery(raw, { useText = true } = {}) {
  const query = { status: 'published' };
  const { q, category } = raw || {};
  if (q && q.trim()) {
    if (useText) query.$text = { $search: q.trim() };
    else {
      const rx = new RegExp(escapeRegExp(q.trim()), 'i');
      query.$or = [{ title: rx }, { description: rx }, { category: rx }];
    }
  }
  if (category) query.category = String(category);
  return query;
}

exports.listEbooks = async (filters = {}) => {
  const page = toInt(filters.page, 1, { min: 1, max: 1_000_000 });
  const limit = toInt(filters.limit, 12, { min: 1, max: 50 });
  const skip = (page - 1) * limit;

  const projection = 'title slug description category thumbnail pricing publishedAt updatedAt';
  const sortSpec = sortFromKey(filters.sort);
  const qText = buildQuery(filters, { useText: true });

  try {
    const [items, total] = await Promise.all([
      Ebook.find(qText).select(projection).sort(sortSpec).skip(skip).limit(limit).lean(),
      Ebook.countDocuments(qText),
    ]);
    return { items, meta: { page, limit, total, hasNextPage: page * limit < total } };
  } catch (err) {
    const needsFallback = err?.code === 27 || /text index required|no text index/i.test(String(err?.message || ''));
    if (!needsFallback) throw err;
    const qRegex = buildQuery(filters, { useText: false });
    const [items, total] = await Promise.all([
      Ebook.find(qRegex).select(projection).sort(sortSpec).skip(skip).limit(limit).lean(),
      Ebook.countDocuments(qRegex),
    ]);
    return { items, meta: { page, limit, total, hasNextPage: page * limit < total } };
  }
};

exports.getPublicEbookBySlug = async ({ slug, userId }) => {
  if (!slug) return null;

  const doc = await Ebook.findOne({ slug, status: 'published' }).lean();
  if (!doc) return null;

  const priceMinor = doc.pricing?.amountMinor ?? 0;
  const isFree = priceMinor === 0;
  let unlocked = isFree;

  if (!unlocked && userId && Types.ObjectId.isValid(userId)) {
    // membership
    try {
      if (doc.pricing?.includedInMembership) {
        const mem = await Membership.findOne({ userId }).lean();
        if (isMemberActive(mem)) unlocked = true;
      }
    } catch (e) { console.error('[EBOOK] membership check failed', e); }

    // purchase/grant
    try {
      const acc = await EbookAccess.findOne({ userId, ebookId: doc._id, status: 'active' }).lean();
      if (acc && (!acc.expiresAt || acc.expiresAt > new Date())) unlocked = true;
    } catch (e) { console.error('[EBOOK] access check failed', e); }
  }

  const items = unlocked
    ? await EbookItem.find({ ebookId: doc._id })
        .select('_id title type order link file')
        .sort({ order: 1, _id: 1 })
        .lean()
    : [];

  return {
    ebook: {
      id: doc._id,
      slug: doc.slug,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      thumbnail: doc.thumbnail,
      pricing: doc.pricing,
      publishedAt: doc.publishedAt,
      updatedAt: doc.updatedAt,
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
};
