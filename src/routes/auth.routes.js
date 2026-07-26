const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * POST /api/auth/register
 * Registers a resident by default. Passing a valid adminCode registers an admin.
 */
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('estate').optional().trim(),
    body('homeLat').optional().isFloat({ min: -90, max: 90 }),
    body('homeLng').optional().isFloat({ min: -180, max: 180 }),
    body('alertPref').optional().isIn(['radius', 'estate', 'both']),
    body('alertRadiusKm').optional().isFloat({ min: 0.1, max: 50 }),
    body('adminCode').optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        name,
        phone,
        password,
        estate,
        homeLat,
        homeLng,
        alertPref,
        alertRadiusKm,
        emergencyContact,
        adminCode,
      } = req.body;

      const existing = await User.findOne({ phone });
      if (existing) {
        return res.status(409).json({ error: 'An account with this phone number already exists' });
      }

      const role = adminCode && adminCode === process.env.ADMIN_SIGNUP_CODE ? 'admin' : 'resident';
      const passwordHash = await bcrypt.hash(password, 10);

      const user = new User({
        name,
        phone,
        passwordHash,
        role,
        estate: estate || null,
        homeLocation: {
          lat: homeLat ?? null,
          lng: homeLng ?? null,
        },
        alertPref: alertPref || 'both',
        alertRadiusKm: alertRadiusKm ?? Number(process.env.DEFAULT_ALERT_RADIUS_KM || 1.5),
        emergencyContact: emergencyContact || null,
      });

      await user.save();

      const token = signToken(user);
      res.status(201).json({ token, user: user.toSafeJSON() });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/auth/login
 */
router.post(
  '/login',
  [
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { phone, password } = req.body;
      const user = await User.findOne({ phone }).select('+passwordHash');

      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ error: 'Invalid phone number or password' });
      }

      const token = signToken(user);
      res.json({ token, user: user.toSafeJSON() });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
