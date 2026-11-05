const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User.model');
const Appointment = require('../models/Appointment.model');
const QueueTicket = require('../models/QueueTicket.model');
const sendEmail = require('../utils/sendEmail');

const signToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || 'hospital_mcr_secret_key_2026',
    { expiresIn: '1d' }
  );
};

const formatUserPayload = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  isEmailVerified: user.isEmailVerified,
  hospitalCardNumber: user.patientProfile?.hospitalCardNumber || null,
  profile: user.role === 'DOCTOR' ? user.doctorProfile : user.patientProfile,
  doctorProfile: user.doctorProfile,
  patientProfile: user.patientProfile,
});

// 1. Register Patient (Fault-tolerant email sending)
const registerPatient = async (req, res) => {
  try {
    const { fullName, email, phone, password, dateOfBirth, gender, bloodGroup, isVulnerable } =
      req.body;

    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, phone, and password are required.',
      });
    }

    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    const hospitalCardNumber = `HCN-${new Date().getFullYear()}-${randomDigits}`;

    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawVerificationToken).digest('hex');

    const newPatient = await User.create({
      fullName,
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password,
      role: 'PATIENT',
      isEmailVerified: false,
      emailVerificationToken: hashedToken,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
      patientProfile: {
        hospitalCardNumber,
        dateOfBirth,
        gender: gender || 'MALE',
        bloodGroup: bloodGroup || 'O+',
        isVulnerable: Boolean(isVulnerable),
      },
    });

    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
    const verificationUrl = `${clientUrl}/verify-email/${rawVerificationToken}`;

    let emailSent = false;
    try {
      emailSent = await sendEmail({
        to: newPatient.email,
        subject: 'Verify Your Hospital Portal Email - HAQMS',
        html: `<p>Welcome to HAQMS, ${newPatient.fullName}! Click <a href="${verificationUrl}">here</a> to verify your email.</p>`,
        fallbackUrl: verificationUrl,
      });
    } catch (emailErr) {
      console.error('⚠️ SMTP Send Failed during register:', emailErr.message);
    }

    return res.status(201).json({
      success: true,
      requiresVerification: true,
      verificationUrl: !emailSent ? verificationUrl : undefined,
      message: emailSent
        ? `Registration successful! Verification link sent to ${newPatient.email}.`
        : `Account created! Email server is unreachable, please verify directly using this link: ${verificationUrl}`,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email or phone number already exists.',
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Verify Email
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Verification link is invalid or has expired.',
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully! You may now sign in.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Resend Verification Email
const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim(), isActive: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Email is already verified.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
    const verificationUrl = `${clientUrl}/verify-email/${rawToken}`;

    let emailSent = false;
    try {
      emailSent = await sendEmail({
        to: user.email,
        subject: 'New Verification Link - HAQMS',
        html: `<p>Click <a href="${verificationUrl}">here</a> to verify your email.</p>`,
        fallbackUrl: verificationUrl,
      });
    } catch (emailErr) {
      console.error('⚠️ SMTP Send Failed during resend:', emailErr.message);
    }

    return res.status(200).json({
      success: true,
      verificationUrl: !emailSent ? verificationUrl : undefined,
      message: emailSent
        ? `Verification link resent to ${user.email}.`
        : `Email server unreachable. Click or copy this link to verify: ${verificationUrl}`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      isActive: true,
    }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Auto-verify Doctors and Super Admins if they were created before email verification existed
    if (user.role === 'SUPER_ADMIN' || user.role === 'DOCTOR') {
      if (!user.isEmailVerified) {
        user.isEmailVerified = true;
        await user.save();
      }
    } else if (user.isEmailVerified === false) {
      return res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        message: 'Please verify your email address before logging in.',
      });
    }

    const token = signToken(user);
    return res.status(200).json({ success: true, token, data: formatUserPayload(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Get Current User
const getCurrentUser = async (req, res) => {
  return res.status(200).json({ success: true, data: formatUserPayload(req.user) });
};

// 6. Forgot Password (Fault-tolerant email sending)
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim(), isActive: true });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No active account found with that email address.',
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
    const resetUrl = `${clientUrl}/reset-password/${rawToken}`;

    let emailSent = false;
    try {
      emailSent = await sendEmail({
        to: user.email,
        subject: 'Password Reset - HAQMS',
        html: `<p>Click <a href="${resetUrl}">here</a> to reset your password within 1 hour.</p>`,
        fallbackUrl: resetUrl,
      });
    } catch (emailErr) {
      console.error('⚠️ SMTP Send Failed during forgotPassword:', emailErr.message);
    }

    return res.status(200).json({
      success: true,
      resetUrl: !emailSent ? resetUrl : undefined,
      message: emailSent
        ? `Password reset link sent to ${user.email}.`
        : `Email server blocked by host. Copy this direct reset link: ${resetUrl}`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 7. Reset Password
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.',
      });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Reset link is invalid or has expired.',
      });
    }

    user.password = newPassword;
    user.isEmailVerified = true; // Also mark email verified upon password reset
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successful! You may now sign in.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 8. Update Password (Logged In)
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await user.comparePassword(currentPassword))) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect.',
      });
    }

    user.password = newPassword;
    await user.save();
    return res.status(200).json({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 9. Delete Account
const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password.',
      });
    }

    await Promise.all([
      Appointment.deleteMany({ $or: [{ patientId: user._id }, { doctorId: user._id }] }),
      QueueTicket.deleteMany({ $or: [{ patientId: user._id }, { doctorId: user._id }] }),
      User.findByIdAndDelete(user._id),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Account permanently deleted.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  registerPatient,
  verifyEmail,
  resendVerificationEmail,
  login,
  getCurrentUser,
  forgotPassword,
  resetPassword,
  updatePassword,
  deleteAccount,
};