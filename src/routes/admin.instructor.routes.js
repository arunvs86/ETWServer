const express = require('express');
const router = express.Router();
const ctr = require('../controllers/adminInstructor.controller');

// NOTE: plug in real admin auth when ready
// const { authGuard, requireRole } = require('../middlewares/auth');
// router.use(authGuard, requireRole('admin'));

router.get('/instructor-applications', ctr.list);
router.get('/instructor-applications/:id', ctr.getOne);
router.post('/instructor-applications/:id/approve', ctr.approve);
router.post('/instructor-applications/:id/reject', ctr.reject);
router.patch('/instructor-applications/:id/notes', ctr.updateNotes);

module.exports = router;
