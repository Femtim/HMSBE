const { Router } = require('express');
const authRoutes = require('./auth.routes');
const appointmentRoutes = require('./appointment.routes');
const queueRoutes = require('./queue.routes');
const adminRoutes = require('./admin.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/queue', queueRoutes);
router.use('/admin', adminRoutes);

module.exports = router;