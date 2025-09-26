// routes/me.purchases.routes.js
const express = require('express');
const router = express.Router();

const { authGuard } = require('../middlewares/auth');
const ctrl = require('../controllers/mePurchases.controller');

// All routes require auth
router.use(authGuard);

// Generic unified endpoint
router.get('/', ctrl.list);

// Convenience typed aliases
router.get('/ebooks',        (req, res, next) => ctrl.listItems(req, res, next, { kinds: ['ebook'] }));
router.get('/resources',     (req, res, next) => ctrl.listItems(req, res, next, { kinds: ['resource'] }));
router.get('/quizzes',       (req, res, next) => ctrl.listItems(req, res, next, { kinds: ['quiz'] }));
router.get('/live-sessions', (req, res, next) => ctrl.listItems(req, res, next, { kinds: ['live-session'] }));
router.get('/courses',       (req, res, next) => ctrl.listItems(req, res, next, { kinds: ['course'] }));

module.exports = router;
