const router = require('express').Router();
const { authGuard, requireRole } = require('../middlewares/auth');
const ctrl = require('../controllers/ebookInstructor.controller');

// CREATE draft ebook  → POST /instructor/ebooks
router.post('/', authGuard, requireRole('instructor','admin'), ctrl.createDraft);

// (rest of your endpoints, all relative)
// GET    /instructor/ebooks
router.get('/', authGuard, requireRole('instructor','admin'), ctrl.listMine);
// GET    /instructor/ebooks/:id
router.get('/:id', authGuard, requireRole('instructor','admin'), ctrl.getMine);
// PATCH  /instructor/ebooks/:id/basics
router.patch('/:id/basics', authGuard, requireRole('instructor','admin'), ctrl.updateBasics);
// PATCH  /instructor/ebooks/:id/pricing
router.patch('/:id/pricing', authGuard, requireRole('instructor','admin'), ctrl.updatePricing);
// POST   /instructor/ebooks/:id/publish
router.post('/:id/publish', authGuard, requireRole('instructor','admin'), ctrl.publish);
// POST   /instructor/ebooks/:id/unpublish
router.post('/:id/unpublish', authGuard, requireRole('instructor','admin'), ctrl.unpublish);
// POST   /instructor/ebooks/:id/archive
router.post('/:id/archive', authGuard, requireRole('instructor','admin'), ctrl.archive);
// POST   /instructor/ebooks/:id/restore
router.post('/:id/restore', authGuard, requireRole('instructor','admin'), ctrl.restore);
// DELETE /instructor/ebooks/:id
router.delete('/:id', authGuard, requireRole('instructor','admin'), ctrl.remove);

// Items (all relative to /instructor/ebooks/:id)
router.get('/:id/items', authGuard, requireRole('instructor','admin'), ctrl.listItems);
router.post('/:id/items', authGuard, requireRole('instructor','admin'), ctrl.createItem);
router.patch('/:id/items/:itemId', authGuard, requireRole('instructor','admin'), ctrl.updateItem);
router.delete('/:id/items/:itemId', authGuard, requireRole('instructor','admin'), ctrl.deleteItem);
router.post('/:id/items/reorder', authGuard, requireRole('instructor','admin'), ctrl.reorderItems);
// optional tiny tweak if you want to use the original name instead of alias:
router.delete('/:id', authGuard, requireRole('instructor','admin'), ctrl.destroy);

module.exports = router;
