const User = require('../models/User.model');
const QueueTicket = require('../models/QueueTicket.model');

const onboardDoctor = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      password,
      department,
      specialization,
      consultationRoom,
      avgConsultationTimeMins,
      workingDays,
      shiftHours,
    } = req.body;

    if (!fullName || !email || !phone || !password || !department || !consultationRoom) {
      return res.status(400).json({ success: false, message: 'All required doctor fields must be provided.' });
    }

    const doctor = await User.create({
      fullName,
      email,
      phone,
      password,
      role: 'DOCTOR',
      doctorProfile: {
        department,
        specialization: specialization || 'General Medical Officer',
        consultationRoom,
        avgConsultationTimeMins: Number(avgConsultationTimeMins) || 15,
        isAvailableToday: true,
        workingDays: workingDays || ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        shiftHours: shiftHours || { start: '08:00', end: '16:00' },
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Doctor onboarded successfully.',
      data: { id: doctor._id, fullName: doctor.fullName, email: doctor.email, doctorProfile: doctor.doctorProfile },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email or phone already exists.' });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getAllDoctors = async (req, res) => {
  try {
    const doctors = await User.find({ role: 'DOCTOR' }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: doctors.length, data: doctors });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const toggleDoctorAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { isAvailableToday } = req.body;

    const updated = await User.findOneAndUpdate(
      { _id: doctorId, role: 'DOCTOR' },
      { $set: { 'doctorProfile.isAvailableToday': Boolean(isAvailableToday) } },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: 'Doctor not found.' });

    return res.status(200).json({ success: true, message: 'Availability updated.', data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getDashboardAnalytics = async (req, res) => {
  try {
    const queryDate = req.query.date || new Date().toISOString().split('T')[0];

    const analytics = await QueueTicket.aggregate([
      { $match: { queueDate: queryDate } },
      {
        $group: {
          _id: '$department',
          totalPatients: { $sum: 1 },
          waitingCount: { $sum: { $cond: [{ $eq: ['$status', 'WAITING'] }, 1, 0] } },
          completedCount: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          noShowCount: { $sum: { $cond: [{ $eq: ['$status', 'NO_SHOW'] }, 1, 0] } },
          avgWaitTimeMins: { $avg: { $cond: [{ $gt: ['$metrics.actualWaitTimeMins', 0] }, '$metrics.actualWaitTimeMins', null] } },
          avgConsultationMins: { $avg: { $cond: [{ $gt: ['$metrics.actualConsultationMins', 0] }, '$metrics.actualConsultationMins', null] } },
        },
      },
      {
        $project: {
          department: '$_id',
          _id: 0,
          totalPatients: 1,
          waitingCount: 1,
          completedCount: 1,
          noShowCount: 1,
          avgWaitTimeMins: { $ifNull: [{ $round: ['$avgWaitTimeMins', 1] }, 0] },
          avgConsultationMins: { $ifNull: [{ $round: ['$avgConsultationMins', 1] }, 0] },
        },
      },
      { $sort: { totalPatients: -1 } },
    ]);

    return res.status(200).json({ success: true, date: queryDate, analytics });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  onboardDoctor,
  getAllDoctors,
  toggleDoctorAvailability,
  getDashboardAnalytics,
};