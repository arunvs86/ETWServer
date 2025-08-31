const router = require('express').Router();
const { owned } = require('../controllers/meCourseAccess.controller');
const { authGuard } = require('../middlewares/auth');

router.get('/me/courses/:slug/owned', authGuard, owned);

module.exports = router;
