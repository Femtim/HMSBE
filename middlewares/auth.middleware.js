const jwt = require('jsonwebtoken');
const User = require('../models/User.model'); // Direct model import instead of repository

const authenticate = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'hospital_mvcr_secret_key_2026'
    );
    
    // Query User model directly
    const currentUser = await User.findById(decoded.id);

    if (!currentUser || !currentUser.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User account no longer exists or is inactive.',
      });
    }

    req.user = currentUser;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token. Please log in again.',
    });
  }
};

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access Denied: Role '${req.user?.role}' cannot perform this action.`,
      });
    }
    next();
  };
};

module.exports = {
  authenticate,
  authorizeRoles,
};