// controllers/tutors.controller.js
const TutorProfile = require('../models/TutorProfile');
const User = require('../models/User');
const { Types } = require('mongoose');           // <-- ensure this

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const asyncH = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * PUBLIC: List tutors (only listed=true)
 * Query: subject, language, minPrice, maxPrice, q (search in headline/bio), sort, page, limit
 */
exports.getPublicTutors = asyncH(async (req, res) => {
  const {
    subject, language, minPrice, maxPrice, q,
    sort = 'rating', page = 1, limit = 12
  } = req.query;

  const filter = { isListed: true };
  if (subject) filter.subjects = { $in: [subject] };
  if (language) filter.languages = { $in: [language] };
  if (minPrice || maxPrice) {
    filter.hourlyRateMinor = {};
    if (minPrice) filter.hourlyRateMinor.$gte = Number(minPrice);
    if (maxPrice) filter.hourlyRateMinor.$lte = Number(maxPrice);
  }
  if (q) {
    filter.$or = [
      { headline: { $regex: q, $options: 'i' } },
      { bio: { $regex: q, $options: 'i' } }
    ];
  }

  const sortMap = {
    rating: { ratingAvg: -1, ratingCount: -1 },
    price_asc: { hourlyRateMinor: 1 },
    price_desc: { hourlyRateMinor: -1 },
    recent: { createdAt: -1 }
  };
  const sortStage = sortMap[sort] || sortMap.rating;

  const pg = Math.max(1, Number(page));
  const lim = Math.min(50, Math.max(1, Number(limit)));
  const skip = (pg - 1) * lim;

  // Join with user for name+avatar
  const [items, total] = await Promise.all([
    TutorProfile.aggregate([
      { $match: filter },
      { $sort: sortStage },
      { $skip: skip },
      { $limit: lim },
      { $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      { $project: {
          _id: 1, userId: 1, headline: 1, bio: 1, subjects: 1, languages: 1,
          timezone: 1, hourlyRateMinor: 1, currency: 1, meetingProvider: 1,
          isListed: 1, ratingAvg: 1, ratingCount: 1, createdAt: 1, updatedAt: 1,
          'user.name': 1, 'user.avatar': 1
        }
      }
    ]),
    TutorProfile.countDocuments(filter)
  ]);

  res.json({
    page: pg, limit: lim, total, items
  });
});

/**
 * PUBLIC: Tutor detail (listed only)
 */
exports.getTutorPublicDetail = async (req, res, next) => {
  try {
    const tutorId = req.params.tutorId;
    if (!Types.ObjectId.isValid(tutorId)) {      // <-- guard
      return res.status(404).json({ message: 'Tutor not found' });
    }

    const profile = await TutorProfile.findOne({ userId: tutorId, isListed: true }).lean();
    if (!profile) return res.status(404).json({ message: 'Tutor not found' });

    const user = await User.findById(tutorId).select('name avatar role isActive').lean();
    if (!user || user.role !== 'instructor' || !user.isActive) {
      return res.status(404).json({ message: 'Tutor not found' });
    }

    res.json({ profile, user: { _id: user._id, name: user.name, avatar: user.avatar } });
  } catch (err) { next(err); }
};

/**
 * SELF: Get my profile (create UI decides based on 404)
 */
exports.getMyTutorProfile = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const doc = await TutorProfile.findOne({ userId: me }).lean();
  if (!doc) throw httpError(404, 'Tutor profile not found');
  res.json(doc);
});

/**
 * SELF: Create my profile (only once)
 */
exports.createMyTutorProfile = asyncH(async (req, res) => {
  const me = req.auth.userId;

  const user = await User.findById(me).select('role').lean();
  if (!user || user.role !== 'instructor') throw httpError(403, 'Only instructors can create a tutor profile');

  const exists = await TutorProfile.findOne({ userId: me }).lean();
  if (exists) throw httpError(409, 'Tutor profile already exists');

  const doc = await TutorProfile.create({ userId: me, ...req.validated });
  res.status(201).json(doc);
});

/**
 * SELF: Update my profile
 */
exports.updateMyTutorProfile = asyncH(async (req, res) => {
  const me = req.auth.userId;

  const doc = await TutorProfile.findOneAndUpdate(
    { userId: me },
    { $set: req.validated },
    { new: true }
  );
  if (!doc) throw httpError(404, 'Tutor profile not found');
  res.json(doc);
});

/**
 * SELF: Delete my profile (soft → isListed=false)
 */
exports.deleteMyTutorProfile = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const doc = await TutorProfile.findOneAndUpdate(
    { userId: me },
    { $set: { isListed: false } },
    { new: true }
  );
  if (!doc) throw httpError(404, 'Tutor profile not found');
  res.json({ message: 'Tutor profile unlisted', profile: doc });
});

/**
 * ADMIN: Toggle listing on/off for a tutorId
 * Body: { isListed: boolean }
 */
exports.adminSetTutorListing = asyncH(async (req, res) => {
  const tutorId = req.params.tutorId;
  const { isListed } = req.body || {};
  if (typeof isListed !== 'boolean') throw httpError(400, 'isListed must be boolean');

  const profile = await TutorProfile.findOneAndUpdate(
    { userId: tutorId },
    { $set: { isListed } },
    { new: true }
  );
  if (!profile) throw httpError(404, 'Tutor profile not found');

  res.json(profile);
});
