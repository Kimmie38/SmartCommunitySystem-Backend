const express = require('express');
const mongoose = require('mongoose');
const { body, query, param, validationResult } = require('express-validator');
const Report = require('../models/Report');
const User = require('../models/User');
const AlertDispatch = require('../models/AlertDispatch');
const { authenticate, requireRole } = require('../middleware/auth');
const { toRoughArea } = require('../utils/geo');

const { REPORT_TYPES, STATUSES } = Report;

const router = express.Router();
router.use(authenticate);

/**
 * Find residents who should be alerted for a new report, based on each
 * resident's own alert preference (radius / estate / both).
 *
 * Two candidate sets are gathered separately because each resident has
 * their own alertRadiusKm, which a single native $geoNear/$maxDistance
 * query can't express per-document — so we geo-query broadly, then filter
 * candidates against their own radius setting in application code.
 */
async function findNearbyResidents(report) {
  const MAX_POSSIBLE_RADIUS_METERS = 50 * 1000; // matches the schema's alertRadiusKm max

  const radiusCandidates = await User.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [report.location.lng, report.location.lat] },
        distanceField: 'distanceMeters',
        maxDistance: MAX_POSSIBLE_RADIUS_METERS,
        spherical: true,
        query: {
          role: 'resident',
          _id: { $ne: report.reporter },
          alertPref: { $in: ['radius', 'both'] },
        },
      },
    },
  ]);

  const radiusMatches = radiusCandidates.filter(
    (u) => u.distanceMeters / 1000 <= (u.alertRadiusKm || 1.5)
  );

  let estateMatches = [];
  if (report.estate) {
    estateMatches = await User.find({
      role: 'resident',
      _id: { $ne: report.reporter },
      estate: report.estate,
      alertPref: { $in: ['estate', 'both'] },
    }).lean();
  }

  const combined = new Map();
  for (const u of [...radiusMatches, ...estateMatches]) {
    combined.set(u._id.toString(), u);
  }
  return [...combined.values()];
}

/**
 * POST /api/reports
 * Residents submit an emergency report. Triggers alert dispatch to nearby residents.
 */
router.post(
  '/',
  requireRole('resident'),
  [
    body('type').isIn(REPORT_TYPES).withMessage(`type must be one of: ${REPORT_TYPES.join(', ')}`),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid lat is required'),
    body('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid lng is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { type, description, lat, lng } = req.body;
      const reporter = await User.findById(req.user.id);
      if (!reporter) return res.status(404).json({ error: 'Reporter account not found' });

      const roughArea = toRoughArea(lat, lng, reporter.estate);

      const report = new Report({
        reporter: reporter._id,
        type,
        description: description || null,
        location: { lat, lng },
        estate: reporter.estate || null,
        roughArea,
        status: 'new',
        statusHistory: [{ status: 'new', note: 'Report submitted', changedBy: reporter._id }],
      });

      await report.save();

      const nearby = await findNearbyResidents(report);
      if (nearby.length) {
        const ops = nearby.map((resident) => ({
          updateOne: {
            filter: { report: report._id, recipient: resident._id },
            update: { $setOnInsert: { report: report._id, recipient: resident._id, seen: false } },
            upsert: true,
          },
        }));
        await AlertDispatch.bulkWrite(ops);
      }

      res.status(201).json({ report, alertsDispatched: nearby.length });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/reports/mine
 * A resident's own submitted reports with full status history.
 */
router.get('/mine', requireRole('resident'), async (req, res, next) => {
  try {
    const reports = await Report.find({ reporter: req.user.id }).sort({ createdAt: -1 });
    res.json({ reports });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports/nearby
 * Anonymized feed of alerts dispatched to the current resident.
 * No reporter identity or exact location is exposed.
 */
router.get('/nearby', requireRole('resident'), async (req, res, next) => {
  try {
    const dispatches = await AlertDispatch.find({ recipient: req.user.id })
      .populate({ path: 'report', select: 'type roughArea status createdAt' })
      .sort({ createdAt: -1 });

    const alerts = dispatches
      .filter((d) => d.report) // guard against a since-deleted report
      .map((d) => ({
        id: d.report._id,
        type: d.report.type,
        roughArea: d.report.roughArea,
        status: d.report.status,
        createdAt: d.report.createdAt,
        seen: d.seen,
      }));

    res.json({ alerts });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/reports/nearby/:id/seen
 * Mark a dispatched alert as seen/read by the resident.
 */
router.patch('/nearby/:id/seen', requireRole('resident'), [param('id').isMongoId()], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    await AlertDispatch.updateOne(
      { report: req.params.id, recipient: req.user.id },
      { $set: { seen: true } }
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports
 * Admin: list all reports, filterable by type/status/date/estate.
 */
router.get(
  '/',
  requireRole('admin'),
  [
    query('type').optional().isIn(REPORT_TYPES),
    query('status').optional().isIn(STATUSES),
    query('estate').optional().trim(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { type, status, estate, from, to } = req.query;
      const filter = {};
      if (type) filter.type = type;
      if (status) filter.status = status;
      if (estate) filter.estate = estate;
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(to);
      }

      const reports = await Report.find(filter)
        .populate({ path: 'reporter', select: 'name phone' })
        .sort({ createdAt: -1 });

      res.json({ reports });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/reports/:id
 * Admin sees full detail. A resident may only view their own report in full.
 */
router.get('/:id', [param('id').isMongoId()], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const report = await Report.findById(req.params.id).populate({
      path: 'reporter',
      select: 'name phone emergencyContact',
    });

    if (!report) return res.status(404).json({ error: 'Report not found' });

    if (req.user.role !== 'admin' && report.reporter._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'You do not have permission to view this report' });
    }

    res.json({ report });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/reports/:id/status
 * Admin updates a report's status (New -> Acknowledged -> In Progress -> Resolved, etc).
 */
router.patch(
  '/:id/status',
  requireRole('admin'),
  [
    param('id').isMongoId(),
    body('status').isIn(STATUSES).withMessage(`status must be one of: ${STATUSES.join(', ')}`),
    body('note').optional().trim().isLength({ max: 500 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const report = await Report.findById(req.params.id);
      if (!report) return res.status(404).json({ error: 'Report not found' });

      const { status, note } = req.body;
      report.status = status;
      report.statusHistory.push({
        status,
        note: note || null,
        changedBy: new mongoose.Types.ObjectId(req.user.id),
      });

      await report.save();
      res.json({ report });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
