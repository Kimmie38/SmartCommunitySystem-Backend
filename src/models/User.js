const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['resident', 'admin'], default: 'resident' },
    estate: { type: String, trim: true, default: null, index: true },
    homeLocation: {
      lat: { type: Number, min: -90, max: 90, default: null },
      lng: { type: Number, min: -180, max: 180, default: null },
    },
    alertPref: { type: String, enum: ['radius', 'estate', 'both'], default: 'both' },
    alertRadiusKm: { type: Number, default: 1.5, min: 0.1, max: 50 },
    emergencyContact: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

// Geospatial index for radius-based nearby queries.
// Mongo's 2dsphere index expects GeoJSON, so we maintain a parallel
// `homeLocationGeo` field alongside the plain lat/lng for readability.
userSchema.add({
  homeLocationGeo: {
    type: { type: String, enum: ['Point'], default: undefined },
    coordinates: { type: [Number], default: undefined }, // [lng, lat]
  },
});
userSchema.index({ homeLocationGeo: '2dsphere' });

userSchema.pre('save', function setGeoPoint(next) {
  if (this.homeLocation && this.homeLocation.lat != null && this.homeLocation.lng != null) {
    this.homeLocationGeo = {
      type: 'Point',
      coordinates: [this.homeLocation.lng, this.homeLocation.lat],
    };
  } else {
    this.homeLocationGeo = undefined;
  }
  next();
});

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  delete obj.homeLocationGeo;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
