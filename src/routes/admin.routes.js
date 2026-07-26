const express = require('express');
const Report = require('../models/Report');
const User = require('../models/User');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

/**
 * GET /api/admin/analytics
 * High-level counts, breakdowns, and recurring-incident hotspots by estate.
 */
router.get('/analytics', async (req, res, next) => {
  try {
    const [totalReports, totalResidents, byType, byStatus, hotspots, recent] = await Promise.all([
      Report.countDocuments(),
      User.countDocuments({ role: 'resident' }),
      Report.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, type: '$_id', count: 1 } },
      ]),
      Report.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, status: '$_id', count: 1 } },
      ]),
      Report.aggregate([
        { $match: { estate: { $ne: null } } },
        { $group: { _id: '$estate', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, estate: '$_id', count: 1 } },
      ]),
      Report.find().sort({ createdAt: -1 }).limit(10).select('type status estate createdAt'),
    ]);

    res.json({ totalReports, totalResidents, byType, byStatus, hotspots, recent });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
