const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/instructorResource.controller');
const { authGuard, requireRole } = require('../middlewares/auth');

router.use(authGuard, requireRole('instructor', 'admin'));

// Resource shell
router.get('/resources', ctrl.listMine);
router.get('/resources/:id', ctrl.getOne);
router.post('/resources', ctrl.createDraft);
router.patch('/resources/:id', ctrl.updateBasics);
router.patch('/resources/:id/pricing', ctrl.updatePricing);
router.post('/resources/:id/publish', ctrl.publish);
router.post('/resources/:id/unpublish', ctrl.unpublish);
router.post('/resources/:id/archive', ctrl.archive);
router.post('/resources/:id/restore', ctrl.restore);
router.delete('/resources/:id', ctrl.destroy);

// Items
router.get('/resources/:id/items', ctrl.listItems);
router.post('/resources/:id/items', ctrl.createItem);
router.patch('/resources/:id/items/:itemId', ctrl.updateItem);
router.delete('/resources/:id/items/:itemId', ctrl.deleteItem);
router.post('/resources/:id/items:reorder', ctrl.reorderItems); // body: { order: [itemId,..] }

module.exports = router;
