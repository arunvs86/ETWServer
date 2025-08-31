const { Schema, model } = require('mongoose');

const GoogleSubSchema = new Schema(
  {
    sub: { type: String },     // Google unique user ID
    picture: { type: String }  // Google avatar URL
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    name: { type: String, trim: true, default: '' },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },

    // May be absent for Google-only accounts
    passwordHash: { type: String, select: false },

    role: {
      type: String,
      enum: ['student', 'instructor', 'admin'],
      default: 'student',
      index: true
    },

    avatar: { type: String, default: '' },

    // Google identity (for OAuth)
    google: { type: GoogleSubSchema, default: undefined },

    // Operational fields
    emailVerifiedAt: { type: Date },
    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },
    archivedAt: { type: Date },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Unique when present (allows non-Google users too)
UserSchema.index({ 'google.sub': 1 }, { unique: true, sparse: true });

// Must have either a password OR a Google identity
UserSchema.pre('validate', function (next) {
  const hasPassword = !!this.passwordHash;
  const hasGoogle = !!this.google?.sub;
  if (!hasPassword && !hasGoogle) {
    return next(new Error('User must have a password or a Google identity.'));
  }
  next();
});

// Track password changes for token invalidation
UserSchema.pre('save', function (next) {
  if (this.isModified('passwordHash')) {
    this.passwordChangedAt = new Date();
  }
  next();
});

UserSchema.methods.wasPasswordChangedAfter = function (jwtIatSeconds) {
  if (!this.passwordChangedAt) return false;
  return Math.floor(this.passwordChangedAt.getTime() / 1000) > jwtIatSeconds;
};

// Hide sensitive/internal fields
const hideSensitive = (_, ret) => {
  delete ret.passwordHash;
  delete ret.__v;
  return ret;
};
UserSchema.set('toJSON', { transform: hideSensitive });
UserSchema.set('toObject', { transform: hideSensitive });

module.exports = model('User', UserSchema);
