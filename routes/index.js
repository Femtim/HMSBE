const { Router } = require('express');
const router = Router();

router.use('/auth', require('./auth.routes'));
router.use('/appointments', require('./appointment.routes'));
router.use('/queue', require('./queue.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;