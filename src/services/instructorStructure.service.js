// src/services/instructorStructure.service.js
// Real DB logic aligned to your models: Section(order), Lesson(type/video), Quiz.

const { Types } = require('mongoose');
const Course  = require('../models/Course');
const Section = require('../models/Section');
const Lesson  = require('../models/Lesson');

const isObjId = (id) => Types.ObjectId.isValid(id);
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const toInt = (v, def = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def);

async function ensureInstructorOwnsCourse(courseId, instructorId) {
  if (!isObjId(courseId)) throw httpError(400, 'Invalid course id');
  const course = await Course.findById(courseId).lean();
  if (!course) throw httpError(404, 'Course not found');
  if (!instructorId || String(course.instructorId) !== String(instructorId)) {
    throw httpError(403, 'Not allowed');
  }
  if (course.status === 'archived') throw httpError(400, 'Course is archived');
  return course;
}

async function getSectionAndCourse(sectionId, instructorId) {
  if (!isObjId(sectionId)) throw httpError(400, 'Invalid section id');
  const section = await Section.findById(sectionId).lean();
  if (!section) throw httpError(404, 'Section not found');
  const course = await ensureInstructorOwnsCourse(section.courseId, instructorId);
  return { section, course };
}

async function getLessonSectionCourse(lessonId, instructorId) {
  if (!isObjId(lessonId)) throw httpError(400, 'Invalid lesson id');
  const lesson = await Lesson.findById(lessonId).lean();
  if (!lesson) throw httpError(404, 'Lesson not found');
  const section = await Section.findById(lesson.sectionId).lean();
  if (!section) throw httpError(500, 'Dangling lesson without section');
  const course = await ensureInstructorOwnsCourse(section.courseId, instructorId);
  return { lesson, section, course };
}

function normalizeResources(arr) {
  if (!arr) return [];
  const list = Array.isArray(arr) ? arr : String(arr).split(',');
  return list.map(String).map(s => s.trim()).filter(Boolean);
}

//
// ---------- Sections ----------
//

async function createSection({ instructorId, courseId, payload }) {
  if (!instructorId) throw httpError(401, 'Auth required');
  await ensureInstructorOwnsCourse(courseId, instructorId);

  const title = String(payload?.title || '').trim();
  if (!title) throw httpError(400, 'Section title is required');

  const count = await Section.countDocuments({ courseId });
  let toOrder = payload?.order != null ? toInt(payload.order, count) : count;
  if (toOrder < 0) toOrder = 0;
  if (toOrder > count) toOrder = count;

  if (toOrder < count) {
    await Section.updateMany(
      { courseId, order: { $gte: toOrder } },
      { $inc: { order: 1 } }
    );
  }

  const section = await Section.create({ courseId, title, order: toOrder });

  return {
    section: {
      id: section._id, courseId: section.courseId, title: section.title,
      order: section.order, createdAt: section.createdAt, updatedAt: section.updatedAt,
    },
  };
}

async function updateSection({ instructorId, sectionId, payload }) {
  const { section } = await getSectionAndCourse(sectionId, instructorId);

  const updates = {};
  if (payload?.title != null) updates.title = String(payload.title).trim();

  if (Object.keys(updates).length === 0) {
    return { section: { id: section._id }, updated: false };
  }

  const doc = await Section.findByIdAndUpdate(sectionId, updates, { new: true }).lean();
  return {
    section: {
      id: doc._id, courseId: doc.courseId, title: doc.title,
      order: doc.order, updatedAt: doc.updatedAt,
    },
    updated: true,
  };
}

async function reorderSection({ instructorId, sectionId, toIndex }) {
  const { section } = await getSectionAndCourse(sectionId, instructorId);
  const siblingCount = await Section.countDocuments({ courseId: section.courseId });

  let target = toInt(toIndex, section.order);
  if (target < 0) target = 0;
  if (target > siblingCount - 1) target = siblingCount - 1;

  if (target === section.order) {
    return { section: { id: section._id, toIndex: target }, reordered: false };
  }

  if (target > section.order) {
    await Section.updateMany(
      { courseId: section.courseId, order: { $gt: section.order, $lte: target } },
      { $inc: { order: -1 } }
    );
  } else {
    await Section.updateMany(
      { courseId: section.courseId, order: { $gte: target, $lt: section.order } },
      { $inc: { order: 1 } }
    );
  }

  const updated = await Section.findByIdAndUpdate(sectionId, { order: target }, { new: true }).lean();
  return { section: { id: updated._id, courseId: updated.courseId, order: updated.order }, reordered: true };
}

async function deleteSection({ instructorId, sectionId }) {
  const { section } = await getSectionAndCourse(sectionId, instructorId);

  // Sum only video durations inside this section
  const [sumDoc] = await Lesson.aggregate([
    { $match: { sectionId: section._id } },
    { $group: {
        _id: null,
        total: {
          $sum: {
            $cond: [{ $eq: ['$type', 'video'] }, { $ifNull: ['$video.durationSec', 0] }, 0]
          }
        }
    } }
  ]);
  const sumSec = sumDoc?.total || 0;

  await Lesson.deleteMany({ sectionId: section._id });

  await Section.deleteOne({ _id: section._id });

  await Section.updateMany(
    { courseId: section.courseId, order: { $gt: section.order } },
    { $inc: { order: -1 } }
  );

  if (sumSec > 0) {
    await Course.updateOne({ _id: section.courseId }, { $inc: { totalDurationSec: -sumSec } });
  }

  return { deleted: true, sectionId };
}

//
// ---------- Lessons ----------
//

function validateAndBuildLessonFields(payload) {
  const title = String(payload?.title || '').trim();
  if (!title) throw httpError(400, 'Lesson title is required');

  const type = payload?.type || 'video';
  if (!['video', 'text', 'quiz'].includes(type)) throw httpError(400, 'Invalid lesson type');

  const fields = { title, type };

  if (payload?.resources != null) {
    fields.resources = normalizeResources(payload.resources);
  }

  if (type === 'video') {
    const v = payload?.video || {};
    const hasRef = !!(v.url || v.assetId);
    if (!hasRef) throw httpError(400, 'Video lesson requires video.url or video.assetId');
    const durationSec = toInt(v.durationSec, 0);
    if (durationSec < 0) throw httpError(400, 'video.durationSec must be >= 0');
    fields.video = {
      provider: v.provider || 's3',
      assetId: v.assetId || '',
      url: v.url || '',
      durationSec,
      captions: Array.isArray(v.captions) ? v.captions : [],
    };
    // clear other kinds
    fields.textContent = undefined;
    fields.quizId = undefined;
  }

  if (type === 'text') {
    const text = String(payload?.textContent || '').trim();
    if (!text) throw httpError(400, 'Text lesson requires textContent');
    fields.textContent = text;
    fields.video = undefined;
    fields.quizId = undefined;
  }

  if (type === 'quiz') {
    const qid = payload?.quizId;
    if (!isObjId(qid)) throw httpError(400, 'Quiz lesson requires valid quizId');
    fields.quizId = qid;
    fields.video = undefined;
    fields.textContent = undefined;
  }

  return fields;
}

async function createLesson({ instructorId, sectionId, payload }) {
  const { section, course } = await getSectionAndCourse(sectionId, instructorId);

  const fields = validateAndBuildLessonFields(payload);

  const count = await Lesson.countDocuments({ sectionId });
  let toOrder = payload?.order != null ? toInt(payload.order, count) : count;
  if (toOrder < 0) toOrder = 0;
  if (toOrder > count) toOrder = count;

  if (toOrder < count) {
    await Lesson.updateMany(
      { sectionId, order: { $gte: toOrder } },
      { $inc: { order: 1 } }
    );
  }

  const lesson = await Lesson.create({
    sectionId,
    title: fields.title,
    order: toOrder,
    type: fields.type,
    video: fields.video,
    textContent: fields.textContent,
    quizId: fields.quizId,
    resources: fields.resources || [],
  });

  // Adjust course duration if a video
  const addSec = lesson.type === 'video' ? (lesson.video?.durationSec || 0) : 0;
  if (addSec > 0) {
    await Course.updateOne({ _id: course._id }, { $inc: { totalDurationSec: addSec } });
  }

  return {
    lesson: {
      id: lesson._id,
      sectionId: lesson.sectionId,
      title: lesson.title,
      order: lesson.order,
      type: lesson.type,
      video: lesson.video,
      textContent: lesson.textContent,
      quizId: lesson.quizId,
      resources: lesson.resources,
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
    },
  };
}

async function updateLesson({ instructorId, lessonId, payload }) {
  const { lesson, course } = await getLessonSectionCourse(lessonId, instructorId);

  const prevDur = lesson.type === 'video' ? (lesson.video?.durationSec || 0) : 0;

  // Build updates (allow type change)
  let fields;
  try {
    // If `type` not provided, keep the same type but allow partial updates for that type:
    const effectivePayload = { ...payload };

    if (effectivePayload.title == null) effectivePayload.title = lesson.title;

    if (!effectivePayload.type) effectivePayload.type = lesson.type;

    // For partial updates, merge existing nested video before validation so missing url/assetId don't fail
    if (effectivePayload.type === 'video') {
      const mergedVideo = {
        provider: payload?.video?.provider ?? lesson.video?.provider,
        assetId:  payload?.video?.assetId  ?? lesson.video?.assetId,
        url:      payload?.video?.url      ?? lesson.video?.url,
        durationSec: payload?.video?.durationSec ?? lesson.video?.durationSec,
        captions: payload?.video?.captions ?? lesson.video?.captions,
      };
      effectivePayload.video = mergedVideo;
    }
    if (effectivePayload.type === 'text' && effectivePayload.textContent == null) {
      effectivePayload.textContent = lesson.textContent;
    }
    if (effectivePayload.type === 'quiz' && effectivePayload.quizId == null) {
      effectivePayload.quizId = lesson.quizId;
    }

    fields = validateAndBuildLessonFields(effectivePayload);
  } catch (e) {
    e.status = e.status || 400;
    throw e;
  }

  const updates = {
    title: fields.title,
    type: fields.type,
    video: fields.type === 'video' ? fields.video : undefined,
    textContent: fields.type === 'text' ? fields.textContent : undefined,
    quizId: fields.type === 'quiz' ? fields.quizId : undefined,
  };
  if (payload?.resources != null) updates.resources = normalizeResources(payload.resources);

  const updated = await Lesson.findByIdAndUpdate(lessonId, updates, { new: true, runValidators: true }).lean();

  const nextDur = updated.type === 'video' ? (updated.video?.durationSec || 0) : 0;
  const delta = nextDur - prevDur;
  if (delta !== 0) {
    await Course.updateOne({ _id: course._id }, { $inc: { totalDurationSec: delta } });
  }

  return {
    lesson: {
      id: updated._id,
      sectionId: updated.sectionId,
      title: updated.title,
      order: updated.order,
      type: updated.type,
      video: updated.video,
      textContent: updated.textContent,
      quizId: updated.quizId,
      resources: updated.resources,
      updatedAt: updated.updatedAt,
    },
    updated: true,
  };
}

async function reorderLesson({ instructorId, lessonId, toIndex }) {
  const { lesson } = await getLessonSectionCourse(lessonId, instructorId);

  const siblingCount = await Lesson.countDocuments({ sectionId: lesson.sectionId });
  let target = toInt(toIndex, lesson.order);
  if (target < 0) target = 0;
  if (target > siblingCount - 1) target = siblingCount - 1;

  if (target === lesson.order) {
    return { lesson: { id: lesson._id, toIndex: target }, reordered: false };
  }

  if (target > lesson.order) {
    await Lesson.updateMany(
      { sectionId: lesson.sectionId, order: { $gt: lesson.order, $lte: target } },
      { $inc: { order: -1 } }
    );
  } else {
    await Lesson.updateMany(
      { sectionId: lesson.sectionId, order: { $gte: target, $lt: lesson.order } },
      { $inc: { order: 1 } }
    );
  }

  const updated = await Lesson.findByIdAndUpdate(lessonId, { order: target }, { new: true }).lean();

  return { lesson: { id: updated._id, sectionId: updated.sectionId, order: updated.order }, reordered: true };
}

async function deleteLesson({ instructorId, lessonId }) {
  const { lesson, course } = await getLessonSectionCourse(lessonId, instructorId);

  await Lesson.deleteOne({ _id: lesson._id });

  await Lesson.updateMany(
    { sectionId: lesson.sectionId, order: { $gt: lesson.order } },
    { $inc: { order: -1 } }
  );

  const subSec = lesson.type === 'video' ? (lesson.video?.durationSec || 0) : 0;
  if (subSec > 0) {
    await Course.updateOne({ _id: course._id }, { $inc: { totalDurationSec: -subSec } });
  }

  return { deleted: true, lessonId };
}

async function getCurriculum({ instructorId, courseId }) {
    if (!instructorId) throw httpError(401, 'Auth required');
    const course = await ensureInstructorOwnsCourse(courseId, instructorId);
  
    // load sections (ordered)
  const sections = await Section.find({ courseId: course._id })
      .sort({ order: 1, _id: 1 })
      .lean();
  
    const sectionIds = sections.map(s => s._id);
  
    // load lessons for these sections (ordered)
    const lessons = sectionIds.length
      ? await Lesson.find({ sectionId: { $in: sectionIds } })
          .sort({ order: 1, _id: 1 })
          .lean()
      : [];
  
    // group lessons by sectionId
    const bySection = new Map(sectionIds.map(id => [String(id), []]));
    for (const l of lessons) {
      const key = String(l.sectionId);
      const arr = bySection.get(key) || [];
      arr.push({
        id: l._id,
        sectionId: l.sectionId,
        title: l.title,
        order: l.order,
        type: l.type,
        video: l.video,
        textContent: l.textContent,
        quizId: l.quizId,
        resources: l.resources,
        updatedAt: l.updatedAt,
        createdAt: l.createdAt,
      });
      bySection.set(key, arr);
    }
  
    // shape response
    const outSections = sections.map(s => ({
      id: s._id,
      courseId: s.courseId,
      title: s.title,
      order: s.order,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      lessons: bySection.get(String(s._id)) || [],
    }));
  
    return {
      sections: outSections,
      meta: {
        counts: { sections: sections.length, lessons: lessons.length },
      },
    };
  }
  

module.exports = {
  createSection,
  updateSection,
  reorderSection,
  deleteSection,
  createLesson,
  updateLesson,
  reorderLesson,
  deleteLesson,
  getCurriculum
};
