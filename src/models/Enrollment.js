const { Schema, model, Types } = require('mongoose');

const EnrollmentSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Types.ObjectId, ref: 'Course', required: true, index: true },

    // how access was granted
    via: { type: String, enum: ['purchase', 'membership', 'admin'], required: true },
    orderId: { type: Types.ObjectId, ref: 'Order' },        // optional backref (future)
    membershipId: { type: Types.ObjectId, ref: 'Membership' }, // optional backref (future)

    // lifecycle
    status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },
    activatedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date }, // usually null (lifetime); set if time-limited
    notes: { type: String, default: '' }
  },
  { timestamps: true }
);

// ensure one enrollment per user+course (use status to disable instead of duplicating)
EnrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });

// helper to check if the enrollment is currently usable
EnrollmentSchema.methods.isCurrentlyActive = function () {
  if (this.status !== 'active') return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
};

module.exports = model('Enrollment', EnrollmentSchema);
