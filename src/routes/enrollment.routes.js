// src/routes/enrollment.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/enrollment.controller');

const { authGuard, requireRole } = require('../middlewares/auth');
router.use(authGuard);

// Student enrollments
router.post('/enrollments', ctrl.create);
router.get('/me/enrollments', ctrl.listMine);

module.exports = router;
