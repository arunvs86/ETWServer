const express = require('express');
const router = express.Router();
const ctr = require('../controllers/meInstructor.controller');
const { authGuard } = require('../middlewares/auth');  

router.use(authGuard);

router.post('/instructor/apply', ctr.apply);
router.get('/instructor/application', ctr.getMyApplication);

module.exports = router;
