const mongoose = require('mongoose');

const QueueTicketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
    },
    queueDate: {
      type: String,
      required: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    department: {
      type: String,
      required: true,
      enum: ['GENERAL_OPD', 'PEDIATRICS', 'CARDIOLOGY', 'OBGYN', 'ORTHOPEDICS', 'DENTAL'],
    },
    consultationRoom: {
      type: String,
      required: true,
    },
    priorityLabel: {
      type: String,
      enum: ['ROUTINE', 'VULNERABLE', 'EMERGENCY'],
      default: 'ROUTINE',
    },
    priorityWeight: {
      type: Number,
      enum: [1, 2, 3],
      default: 1,
    },
    status: {
      type: String,
      enum: ['WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'SKIPPED', 'NO_SHOW'],
      default: 'WAITING',
    },
    timestampsLog: {
      checkInTime: { type: Date, default: Date.now },
      calledTime: { type: Date },
      consultationStartTime: { type: Date },
      completedTime: { type: Date },
    },
    metrics: {
      actualWaitTimeMins: { type: Number, default: 0 },
      actualConsultationMins: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

QueueTicketSchema.index({
  queueDate: 1,
  doctorId: 1,
  status: 1,
  priorityWeight: -1,
  'timestampsLog.checkInTime': 1,
});

QueueTicketSchema.index({ queueDate: 1, department: 1, ticketNumber: 1 }, { unique: true });

module.exports = mongoose.model('QueueTicket', QueueTicketSchema);