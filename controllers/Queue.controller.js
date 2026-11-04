const QueueTicket = require('../models/QueueTicket.model');
const Appointment = require('../models/Appointment.model');
const User = require('../models/User.model');
const Counter = require('../models/Counter.model');

const DEPT_PREFIX_MAP = {
  GENERAL_OPD: 'OPD',
  PEDIATRICS: 'PED',
  CARDIOLOGY: 'CRD',
  OBGYN: 'OBG',
  ORTHOPEDICS: 'ORT',
  DENTAL: 'DNT',
};

const PRIORITY_WEIGHT_MAP = { ROUTINE: 1, VULNERABLE: 2, EMERGENCY: 3 };

const generateAtomicTicketNumber = async (queueDate, department) => {
  const counterId = `${queueDate}_${department}`;
  const counter = await Counter.findByIdAndUpdate(
    counterId,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const prefix = DEPT_PREFIX_MAP[department] || 'GEN';
  return `${prefix}-${String(counter.seq).padStart(3, '0')}`;
};

const checkInToQueue = async (req, res) => {
  try {
    const { appointmentReference, patientId: walkInPatientId, doctorId: walkInDoctorId, priorityOverride } = req.body;
    const todayStr = new Date().toISOString().split('T')[0];

    let patient, doctor;
    let appointmentId = null;

    if (appointmentReference) {
      const appointment = await Appointment.findOne({ appointmentReference: appointmentReference.trim() }).populate('patientId doctorId');
      if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
      if (appointment.status === 'CHECKED_IN') return res.status(400).json({ success: false, message: 'Already checked in.' });

      patient = appointment.patientId;
      doctor = appointment.doctorId;
      appointmentId = appointment._id;

      await Appointment.findByIdAndUpdate(appointment._id, { $set: { status: 'CHECKED_IN' } });
    } else {
      patient = await User.findById(walkInPatientId || req.user._id);
      doctor = await User.findById(walkInDoctorId);
      if (!patient || !doctor) return res.status(404).json({ success: false, message: 'Patient and Doctor required.' });
    }

    let priorityLabel = 'ROUTINE';
    if (priorityOverride && PRIORITY_WEIGHT_MAP[priorityOverride]) {
      priorityLabel = priorityOverride;
    } else if (patient.patientProfile?.isVulnerable) {
      priorityLabel = 'VULNERABLE';
    }
    const priorityWeight = PRIORITY_WEIGHT_MAP[priorityLabel];
    const department = doctor.doctorProfile.department;
    const ticketNumber = await generateAtomicTicketNumber(todayStr, department);

    const checkInTime = new Date();
    const newTicket = await QueueTicket.create({
      ticketNumber,
      queueDate: todayStr,
      appointmentId,
      patientId: patient._id,
      doctorId: doctor._id,
      department,
      consultationRoom: doctor.doctorProfile.consultationRoom || 'Room 101',
      priorityLabel,
      priorityWeight,
      status: 'WAITING',
      timestampsLog: { checkInTime },
    });

    const patientsAhead = await QueueTicket.countDocuments({
      queueDate: todayStr,
      doctorId: doctor._id,
      status: 'WAITING',
      $or: [
        { priorityWeight: { $gt: priorityWeight } },
        { priorityWeight, 'timestampsLog.checkInTime': { $lt: checkInTime } },
      ],
    });

    const avgConsultMins = doctor.doctorProfile.avgConsultationTimeMins || 15;
    const estimatedWaitTimeMins = patientsAhead * avgConsultMins;

    const io = req.app.get('io');
    if (io) io.to(department).emit('queue:updated', { department, action: 'CHECK_IN', ticketNumber });

    return res.status(201).json({
      success: true,
      message: 'Checked in successfully.',
      data: {
        ticketId: newTicket._id,
        ticketNumber: newTicket.ticketNumber,
        department,
        doctor: doctor.fullName,
        consultationRoom: newTicket.consultationRoom,
        priority: priorityLabel,
        status: newTicket.status,
        patientsAhead,
        estimatedWaitTimeMins,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getMyActiveTicket = async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const ticket = await QueueTicket.findOne({
      queueDate: todayStr,
      patientId: req.user._id,
      status: { $in: ['WAITING', 'CALLED', 'IN_CONSULTATION'] },
    }).populate('doctorId', 'fullName doctorProfile');

    if (!ticket) return res.status(200).json({ success: true, data: null });

    const patientsAhead = await QueueTicket.countDocuments({
      queueDate: todayStr,
      doctorId: ticket.doctorId._id,
      status: 'WAITING',
      $or: [
        { priorityWeight: { $gt: ticket.priorityWeight } },
        { priorityWeight: ticket.priorityWeight, 'timestampsLog.checkInTime': { $lt: ticket.timestampsLog.checkInTime } },
      ],
    });

    const avgConsultMins = ticket.doctorId.doctorProfile?.avgConsultationTimeMins || 15;

    return res.status(200).json({
      success: true,
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        department: ticket.department,
        doctor: ticket.doctorId.fullName,
        consultationRoom: ticket.consultationRoom,
        priority: ticket.priorityLabel,
        status: ticket.status,
        patientsAhead: ticket.status === 'CALLED' ? 0 : patientsAhead,
        estimatedWaitTimeMins: ticket.status === 'CALLED' ? 0 : patientsAhead * avgConsultMins,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const callNextPatient = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const todayStr = new Date().toISOString().split('T')[0];
    const calledTime = new Date();

    const nextTicket = await QueueTicket.findOneAndUpdate(
      { queueDate: todayStr, doctorId, status: 'WAITING' },
      { $set: { status: 'CALLED', 'timestampsLog.calledTime': calledTime } },
      { sort: { priorityWeight: -1, 'timestampsLog.checkInTime': 1 }, new: true }
    ).populate('patientId', 'fullName phone patientProfile');

    if (!nextTicket) {
      return res.status(200).json({ success: true, message: 'No waiting patients.', data: null });
    }

    const waitMs = calledTime - new Date(nextTicket.timestampsLog.checkInTime);
    nextTicket.metrics.actualWaitTimeMins = Math.max(0, Math.round(waitMs / 60000));
    await nextTicket.save();

    const io = req.app.get('io');
    if (io) {
      io.to(nextTicket.department).emit('queue:patient_called', {
        ticketNumber: nextTicket.ticketNumber,
        consultationRoom: nextTicket.consultationRoom,
        doctorName: req.user.fullName,
        department: nextTicket.department,
      });
    }

    return res.status(200).json({ success: true, message: `Calling ${nextTicket.ticketNumber}`, data: nextTicket });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getDoctorActiveTicket = async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const ticket = await QueueTicket.findOne({
      queueDate: todayStr,
      doctorId: req.user._id,
      status: { $in: ['CALLED', 'IN_CONSULTATION'] },
    }).populate('patientId', 'fullName phone patientProfile');

    return res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const completePatientConsultation = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await QueueTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found.' });

    const completedTime = new Date();
    const startTime = ticket.timestampsLog.consultationStartTime || ticket.timestampsLog.calledTime;
    const consultMins = startTime ? Math.max(1, Math.round((completedTime - new Date(startTime)) / 60000)) : 1;

    ticket.status = 'COMPLETED';
    ticket.timestampsLog.completedTime = completedTime;
    ticket.metrics.actualConsultationMins = consultMins;
    await ticket.save();

    if (ticket.appointmentId) {
      await Appointment.findByIdAndUpdate(ticket.appointmentId, { $set: { status: 'COMPLETED' } });
    }

    const io = req.app.get('io');
    if (io) io.to(ticket.department).emit('queue:updated', { department: ticket.department, action: 'COMPLETED', ticketNumber: ticket.ticketNumber });

    return res.status(200).json({ success: true, message: 'Consultation completed.', data: ticket });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getLiveDepartmentBoard = async (req, res) => {
  try {
    const { department } = req.params;
    const todayStr = new Date().toISOString().split('T')[0];

    const liveQueue = await QueueTicket.find({
      queueDate: todayStr,
      department: department.toUpperCase(),
      status: { $in: ['CALLED', 'IN_CONSULTATION', 'WAITING'] },
    })
      .populate('doctorId', 'fullName')
      .select('ticketNumber status priorityLabel consultationRoom timestampsLog.checkInTime doctorId')
      .sort({ status: 1, priorityWeight: -1, 'timestampsLog.checkInTime': 1 })
      .limit(30);

    return res.status(200).json({ success: true, date: todayStr, department: department.toUpperCase(), data: liveQueue });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  checkInToQueue,
  getMyActiveTicket,
  callNextPatient,
  getDoctorActiveTicket,
  completePatientConsultation,
  getLiveDepartmentBoard,
};