const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/users/me
 */
router.get('/me', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/users/me
 * Residents update estate, home location, and alert preferences.
 */
router.patch(
  '/me',
  [
    body('name').optional().trim().notEmpty(),
    body('estate').optional().trim(),
    body('homeLat').optional().isFloat({ min: -90, max: 90 }),
    body('homeLng').optional().isFloat({ min: -180, max: 180 }),
    body('alertPref').optional().isIn(['radius', 'estate', 'both']),
    body('alertRadiusKm').optional().isFloat({ min: 0.1, max: 50 }),
    body('emergencyContact').optional().trim(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { name, estate, homeLat, homeLng, alertPref, alertRadiusKm, emergencyContact } = req.body;

      if (name !== undefined) user.name = name;
      if (estate !== undefined) user.estate = estate;
      if (alertPref !== undefined) user.alertPref = alertPref;
      if (alertRadiusKm !== undefined) user.alertRadiusKm = alertRadiusKm;
      if (emergencyContact !== undefined) user.emergencyContact = emergencyContact;
      if (homeLat !== undefined) user.homeLocation.lat = homeLat;
      if (homeLng !== undefined) user.homeLocation.lng = homeLng;

      // .save() re-triggers the pre-save hook that keeps homeLocationGeo in sync
      await user.save();

      res.json({ user: user.toSafeJSON() });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
