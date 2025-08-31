// src/controllers/instructorStructure.controller.js
const svc = require('../services/instructorStructure.service');

function getInstructorId(req) {
  return req.user?.id || req.user?._id || req.headers['x-user-id'] || req.body?.instructorId || null;
}

async function getCurriculum(req, res, next) {
    try {
      const out = await svc.getCurriculum({
      instructorId: getInstructorId(req),
        courseId: req.params.id,
     });
      return res.json(out);
    } catch (err) { next(err); }
  }

// POST /instructor/courses/:id/sections
async function createSection(req, res, next) {
  try {
    const out = await svc.createSection({
      instructorId: getInstructorId(req),
      courseId: req.params.id,
      payload: req.body || {},
    });
    return res.status(201).json(out);
  } catch (err) { next(err); }
}

// PATCH /instructor/sections/:sectionId
async function updateSection(req, res, next) {
  try {
    const out = await svc.updateSection({
      instructorId: getInstructorId(req),
      sectionId: req.params.sectionId,
      payload: req.body || {},
    });
    return res.json(out);
  } catch (err) { next(err); }
}

// POST /instructor/sections/:sectionId/reorder
async function reorderSection(req, res, next) {
  try {
    const out = await svc.reorderSection({
      instructorId: getInstructorId(req),
      sectionId: req.params.sectionId,
      toIndex: req.body?.toIndex,
    });
    return res.json(out);
  } catch (err) { next(err); }
}

// DELETE /instructor/sections/:sectionId
async function deleteSection(req, res, next) {
  try {
    const out = await svc.deleteSection({
      instructorId: getInstructorId(req),
      sectionId: req.params.sectionId,
    });
    return res.status(202).json(out);
  } catch (err) { next(err); }
}

// POST /instructor/sections/:sectionId/lessons
async function createLesson(req, res, next) {
  try {
    const out = await svc.createLesson({
      instructorId: getInstructorId(req),
      sectionId: req.params.sectionId,
      payload: req.body || {},
    });
    return res.status(201).json(out);
  } catch (err) { next(err); }
}

// PATCH /instructor/lessons/:lessonId
async function updateLesson(req, res, next) {
  try {
    const out = await svc.updateLesson({
      instructorId: getInstructorId(req),
      lessonId: req.params.lessonId,
      payload: req.body || {},
    });
    return res.json(out);
  } catch (err) { next(err); }
}

// POST /instructor/lessons/:lessonId/reorder
async function reorderLesson(req, res, next) {
  try {
    const out = await svc.reorderLesson({
      instructorId: getInstructorId(req),
      lessonId: req.params.lessonId,
      toIndex: req.body?.toIndex,
    });
    return res.json(out);
  } catch (err) { next(err); }
}

// DELETE /instructor/lessons/:lessonId
async function deleteLesson(req, res, next) {
  try {
    const out = await svc.deleteLesson({
      instructorId: getInstructorId(req),
      lessonId: req.params.lessonId,
    });
    return res.status(202).json(out);
  } catch (err) { next(err); }
}

module.exports = {
  getCurriculum,
  createSection,
  updateSection,
  reorderSection,
  deleteSection,
  createLesson,
  updateLesson,
  reorderLesson,
  deleteLesson,
};
