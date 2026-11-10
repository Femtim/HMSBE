const { Router } = require('express');
const {
  onboardDoctor,
  getAllDoctors,
  toggleDoctorAvailability,
  getDashboardAnalytics,
} = require('../controllers/Admin.controller');
const { authenticate, authorizeRoles } = require('../middlewares/auth.middleware');

const router = Router();

router.use(authenticate, authorizeRoles('SUPER_ADMIN'));
router.post('/doctors', onboardDoctor);
router.get('/doctors', getAllDoctors);
router.patch('/doctors/:doctorId/availability', toggleDoctorAvailability);
router.get('/analytics', getDashboardAnalytics);

module.exports = router;