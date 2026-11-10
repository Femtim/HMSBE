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

// 1. Register Patient
const registerPatient = async (req, res) => {
  try {
    const { fullName, email, phone, password, dateOfBirth, gender, bloodGroup, isVulnerable } =
      req.body;

    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled.',
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

    console.log(`[EMAIL DISPATCH] Verification link for ${newPatient.email}: ${verificationUrl}`);

    try {
      await sendEmail({
        to: newPatient.email,
        subject: 'Verify Your Hospital Portal Email - HAQMS',
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
            <h2>Welcome to HAQMS, ${newPatient.fullName}</h2>
            <p>Please verify your email address by clicking the button below within 24 hours:</p>
            <a href="${verificationUrl}" style="background: #0d9488; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Verify Email Address</a>
            <p style="margin-top: 20px; font-size: 12px; color: #64748b;">If you did not request this registration, please ignore this email.</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('SMTP Error during registration email:', emailErr.message);
    }

    return res.status(201).json({
      success: true,
      requiresVerification: true,
      message: `Registration successful. A verification link has been sent to ${newPatient.email}.`,
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
      message: 'Email verified successfully. You may now sign in.',
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

    const clientUrl = (process.env.CLIENT_URL).replace(/\/$/, '');
    const verificationUrl = `${clientUrl}/verify-email/${rawToken}`;

    console.log(`[EMAIL DISPATCH] Resent verification link for ${user.email}: ${verificationUrl}`);

    try {
      await sendEmail({
        to: user.email,
        subject: 'New Verification Link - GENERAL HOSPITAL',
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
            <h2>Email Verification Request</h2>
            <p>Click the button below to verify your email address:</p>
            <a href="${verificationUrl}" style="background: #0d9488; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Verify Email Address</a>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('SMTP Error during resend:', emailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `A new verification link has been sent to ${user.email}.`,
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

    if (user.role === 'SUPER_ADMIN' || user.role === 'DOCTOR') {
      if (!user.isEmailVerified) {
        user.isEmailVerified = true;
        await user.save();
      }
    } else if (!user.isEmailVerified) {
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

// 6. Update Patient Profile & Triage Details
const updateProfile = async (req, res) => {
  try {
    const { fullName, phone, dateOfBirth, gender, bloodGroup, isVulnerable } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    if (fullName) user.fullName = fullName.trim();
    if (phone) user.phone = phone.trim();

    if (user.role === 'PATIENT') {
      if (!user.patientProfile) user.patientProfile = {};
      if (dateOfBirth) user.patientProfile.dateOfBirth = dateOfBirth;
      if (gender) user.patientProfile.gender = gender;
      if (bloodGroup) user.patientProfile.bloodGroup = bloodGroup;
      if (typeof isVulnerable === 'boolean') {
        user.patientProfile.isVulnerable = isVulnerable;
      }
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile and triage details updated.',
      data: formatUserPayload(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'That phone number is already registered to another account.',
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 7. Forgot Password
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

    console.log(`[EMAIL DISPATCH] Password reset link for ${user.email}: ${resetUrl}`);

    try {
      await sendEmail({
        to: user.email,
        subject: 'Password Reset - HAQMS',
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
            <h2>Password Reset Request</h2>
            <p>Click the button below to reset your password within 1 hour:</p>
            <a href="${resetUrl}" style="background: #0d9488; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Reset Password</a>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('SMTP Error during password reset:', emailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Password reset link has been sent to ${user.email}.`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 8. Reset Password
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
    user.isEmailVerified = true;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successful. You may now sign in.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 9. Update Password
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

// 10. Delete Account
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
  updateProfile,
  forgotPassword,
  resetPassword,
  updatePassword,
  deleteAccount,
};