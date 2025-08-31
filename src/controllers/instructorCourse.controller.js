// src/controllers/instructorCourse.controller.js
const svc = require('../services/instructorCourse.service');

function getInstructorId(req) {
  return (
    req.user?.id ||               // primary source (set by authGuard)
    req.headers['x-user-id'] ||   // dev/debug fallback only
    req.body?.instructorId ||     // explicit override (if you ever allow)
    null
  );
}

// POST /instructor/courses
async function createDraft(req, res, next) {
  try {
    const instructorId = getInstructorId(req);
    const out = await svc.createDraftCourse({ instructorId, payload: req.body || {} });
    return res.status(201).json(out);
  } catch (err) {
    next(err);
  }
}

// PATCH /instructor/courses/:id
async function updateBasics(req, res, next) {
  try {
    const instructorId = getInstructorId(req);
    const out = await svc.updateCourseBasics({ instructorId, courseId: req.params.id, payload: req.body || {} });
    return res.json(out);
  } catch (err) {
    next(err);
  }
}

// PATCH /instructor/courses/:id/pricing
async function updatePricing(req, res, next) {
  try {
    const instructorId = getInstructorId(req);
    const out = await svc.updateCoursePricing({ instructorId, courseId: req.params.id, payload: req.body || {} });
    return res.json(out);
  } catch (err) {
    next(err);
  }
}

// POST /instructor/courses/:id/publish
async function publish(req, res, next) {
  try {
    const instructorId = getInstructorId(req);
    const out = await svc.publishCourse({ instructorId, courseId: req.params.id });
    return res.json(out);
  } catch (err) {
    next(err);
  }
}

// POST /instructor/courses/:id/unpublish
async function unpublish(req, res, next) {
  try {
    const instructorId = getInstructorId(req);
    const out = await svc.unpublishCourse({ instructorId, courseId: req.params.id });
    return res.json(out);
  } catch (err) {
    next(err);
  }
}

// POST /instructor/courses/:id/archive
async function archive(req, res, next) {
  try {
    const instructorId = getInstructorId(req);
    const out = await svc.archiveCourse({ instructorId, courseId: req.params.id });
    return res.json(out);
  } catch (err) {
    next(err);
  }
}

// POST /instructor/courses/:id/restore
async function restore(req, res, next) {
  try {
    const instructorId = getInstructorId(req);
    const out = await svc.restoreCourse({ instructorId, courseId: req.params.id });
    return res.json(out);
  } catch (err) {
    next(err);
  }
}

// DELETE /instructor/courses/:id
async function destroy(req, res, next) {
  try {
    const instructorId = getInstructorId(req);
    const out = await svc.deleteCourse({ instructorId, courseId: req.params.id });
    return res.status(202).json(out);
  } catch (err) {
    next(err);
  }
}

// GET /instructor/courses
async function listMine(req, res, next) {
  try {
    const instructorId = getInstructorId(req); // uses req.user.id
    const { status, q, page, limit } = req.query || {};
    const out = await svc.listMyCourses({
      instructorId,
      status: status ? String(status) : undefined,
      q: q ? String(q) : undefined,
      page,
      limit,
    });
    return res.json(out);
  } catch (err) {
    next(err);
  }
}

// GET /instructor/courses/:id
async function getOne(req, res, next) {
  try {
    const instructorId = getInstructorId(req);
    const out = await svc.getMyCourse({ instructorId, courseId: req.params.id });
    return res.json(out);
  } catch (err) {
    next(err);
  }
}

/* -------------------------- Single lesson --------------------------- */

// GET /instructor/courses/:id/lesson
async function getSingleLesson(req, res, next) {
  try {
    const instructorId = getInstructorId(req);
    // ownership check:
    await svc.getMyCourse({ instructorId, courseId: req.params.id });
    const lesson = await svc.getSingleLessonForCourse(req.params.id);
    return res.json({
      lesson: lesson ? {
        id: lesson._id,
        title: lesson.title,
        type: lesson.type,
        video: lesson.video,
        resources: lesson.resources,
        order: lesson.order,
        updatedAt: lesson.updatedAt,
      } : null
    });
  } catch (err) { next(err); }
}

// PUT /instructor/courses/:id/lesson  (upsert)
async function upsertSingleLesson(req, res, next) {
  try {
    const instructorId = getInstructorId(req);
    const out = await svc.upsertSingleLesson({
      instructorId,
      courseId: req.params.id,
      payload: req.body || {},
    });
    return res.json(out);
  } catch (err) { next(err); }
}

// DELETE /instructor/courses/:id/lesson
async function deleteSingleLesson(req, res, next) {
  try {
    const instructorId = getInstructorId(req);
    const out = await svc.deleteSingleLesson({ instructorId, courseId: req.params.id });
    return res.json(out);
  } catch (err) { next(err); }
}

module.exports = {
  createDraft,
  updateBasics,
  updatePricing,
  publish,
  unpublish,
  archive,
  restore,
  destroy,
  listMine,
  getOne,

  // single-lesson
  getSingleLesson,
  upsertSingleLesson,
  deleteSingleLesson,
};
