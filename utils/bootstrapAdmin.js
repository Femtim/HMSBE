const User = require('../models/User.model');

const bootstrapSuperAdmin = async () => {
  try {
    const adminEmail = process.env.SUPER_ADMIN_EMAIL;
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
    const adminPhone = process.env.SUPER_ADMIN_PHONE ;

    const existingAdmin = await User.findOne({ role: 'SUPER_ADMIN' });
    if (existingAdmin) {
      if (!existingAdmin.isEmailVerified) {
        existingAdmin.isEmailVerified = true;
        await existingAdmin.save();
      }
      console.log(`🛡️  Super Admin ready: ${existingAdmin.email}`);
      return;
    }

    await User.create({
      fullName: 'Chief System Administrator',
      email: adminEmail,
      phone: adminPhone,
      password: adminPassword,
      role: 'SUPER_ADMIN',
      isActive: true,
      isEmailVerified: true,
    });

    console.log(`✅ Bootstrapped Super Admin! Email: ${adminEmail}`);
  } catch (error) {
    console.error('❌ Failed to bootstrap Super Admin:', error.message);
  }
};

module.exports = { bootstrapSuperAdmin };