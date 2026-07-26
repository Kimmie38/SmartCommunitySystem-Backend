const mongoose = require('mongoose');

const REPORT_TYPES = [
  'robbery',
  'fire',
  'accident',
  'medical',
  'domestic_threat',
  'suspicious_activity',
  'other',
];

const STATUSES = ['new', 'acknowledged', 'in_progress', 'resolved', 'false_alarm'];

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    note: { type: String, trim: true, default: null },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: REPORT_TYPES, required: true, index: true },
    description: { type: String, trim: true, maxlength: 1000, default: null },
    location: {
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 },
    },
    locationGeo: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    estate: { type: String, trim: true, default: null, index: true },
    roughArea: { type: String, trim: true, default: null },
    status: { type: String, enum: STATUSES, default: 'new', index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },
  },
  { timestamps: true }
);

reportSchema.index({ locationGeo: '2dsphere' });

reportSchema.pre('validate', function setGeoPoint(next) {
  if (this.location && this.location.lat != null && this.location.lng != null) {
    this.locationGeo = { type: 'Point', coordinates: [this.location.lng, this.location.lat] };
  }
  next();
});

module.exports = mongoose.model('Report', reportSchema);
module.exports.REPORT_TYPES = REPORT_TYPES;
module.exports.STATUSES = STATUSES;
