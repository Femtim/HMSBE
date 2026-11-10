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

    const doctor = await User.create({
      fullName,
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password,
      role: 'DOCTOR',
      isEmailVerified: true,
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
    return res.status(201).json({ success: true, message: 'Clinician onboarded.', data: doctor });
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
    const updated = await User.findOneAndUpdate(
      { _id: req.params.doctorId, role: 'DOCTOR' },
      { $set: { 'doctorProfile.isAvailableToday': Boolean(req.body.isAvailableToday) } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Doctor not found.' });
    return res.status(200).json({ success: true, data: updated });
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
        },
      },
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