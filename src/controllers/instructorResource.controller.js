const svc = require('../services/instructorResource.service');

function getInstructorId(req) {
  return req.user?.id || req.user?._id || req.headers['x-user-id'] || null;
}

// shell
exports.createDraft = async (req, res, next) => {
  try { res.status(201).json(await svc.createDraft({ instructorId: getInstructorId(req), payload: req.body || {} })); }
  catch (e) { next(e); }
};
exports.updateBasics = async (req, res, next) => {
  try { res.json(await svc.updateBasics({ instructorId: getInstructorId(req), resourceId: req.params.id, payload: req.body || {} })); }
  catch (e) { next(e); }
};
exports.updatePricing = async (req, res, next) => {
  try { res.json(await svc.updatePricing({ instructorId: getInstructorId(req), resourceId: req.params.id, payload: req.body || {} })); }
  catch (e) { next(e); }
};
exports.publish = async (req, res, next) => {
  try { res.json(await svc.publish({ instructorId: getInstructorId(req), resourceId: req.params.id })); }
  catch (e) { next(e); }
};
exports.unpublish = async (req, res, next) => {
  try { res.json(await svc.unpublish({ instructorId: getInstructorId(req), resourceId: req.params.id })); }
  catch (e) { next(e); }
};
exports.archive = async (req, res, next) => {
  try { res.json(await svc.archive({ instructorId: getInstructorId(req), resourceId: req.params.id })); }
  catch (e) { next(e); }
};
exports.restore = async (req, res, next) => {
  try { res.json(await svc.restore({ instructorId: getInstructorId(req), resourceId: req.params.id })); }
  catch (e) { next(e); }
};
exports.destroy = async (req, res, next) => {
  try { res.json(await svc.destroy({ instructorId: getInstructorId(req), resourceId: req.params.id })); }
  catch (e) { next(e); }
};
exports.listMine = async (req, res, next) => {
  try { res.json(await svc.listMine({ instructorId: getInstructorId(req), ...req.query })); }
  catch (e) { next(e); }
};
exports.getOne = async (req, res, next) => {
  try { res.json(await svc.getOne({ instructorId: getInstructorId(req), resourceId: req.params.id })); }
  catch (e) { next(e); }
};

// items
exports.listItems = async (req, res, next) => {
  try { res.json(await svc.listItems({ instructorId: getInstructorId(req), resourceId: req.params.id })); }
  catch (e) { next(e); }
};
exports.createItem = async (req, res, next) => {
  try { res.status(201).json(await svc.createItem({ instructorId: getInstructorId(req), resourceId: req.params.id, payload: req.body || {} })); }
  catch (e) { next(e); }
};
exports.updateItem = async (req, res, next) => {
  try { res.json(await svc.updateItem({ instructorId: getInstructorId(req), resourceId: req.params.id, itemId: req.params.itemId, payload: req.body || {} })); }
  catch (e) { next(e); }
};
exports.deleteItem = async (req, res, next) => {
  try { res.json(await svc.deleteItem({ instructorId: getInstructorId(req), resourceId: req.params.id, itemId: req.params.itemId })); }
  catch (e) { next(e); }
};
exports.reorderItems = async (req, res, next) => {
  try { res.json(await svc.reorderItems({ instructorId: getInstructorId(req), resourceId: req.params.id, order: req.body?.order || [] })); }
  catch (e) { next(e); }
};
