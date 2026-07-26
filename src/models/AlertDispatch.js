const mongoose = require('mongoose');

const alertDispatchSchema = new mongoose.Schema(
  {
    report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    seen: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

alertDispatchSchema.index({ report: 1, recipient: 1 }, { unique: true });

module.exports = mongoose.model('AlertDispatch', alertDispatchSchema);
