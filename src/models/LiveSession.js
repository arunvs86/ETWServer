// models/LiveSession.js
const { Schema, model, Types } = require('mongoose');

const ZoomSchema = new Schema(
  {
    meetingId: String,
    joinUrl: String,
    startUrl: String,
    passcode: String,
    recordingId: String,
    recordingUrl: String,
  },
  { _id: false }
);

const RecordingFileSchema = new Schema(
  {
    fileType: String,
    downloadUrl: String,
    startTime: Date,
    endTime: Date,
    fileSize: Number,
  },
  { _id: false }
);

const LiveSessionSchema = new Schema(
  {
    hostUserId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Types.ObjectId, ref: 'Course', index: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    thumbnail: { type: String },

    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    timezone: { type: String, default: 'Europe/London' },

    status: { type: String, enum: ['scheduled', 'live', 'ended', 'canceled'], default: 'scheduled', index: true },
    visibility: { type: String, enum: ['course', 'public'], default: 'public', index: true },
    capacity: { type: Number, default: 0, min: 0 },

    provider: { type: String, enum: ['zoom'], default: 'zoom', index: true },

    pricing: {
      type: {
        type: String,
        enum: ['free', 'paid'],
        default: 'free',
        required: true,
      },
      amountMinor: { type: Number, default: 0 },
      currency: { type: String, default: 'GBP' },
    },
    membersAccess: { type: String, enum: ['free', 'paid', 'none'], default: 'none' },

    dummyJoinUrl: { type: String },
    zoom: { type: ZoomSchema, default: undefined },

    recording: {
      status: { type: String, enum: ['none', 'pending', 'available', 'failed'], default: 'none' },
      files: [RecordingFileSchema],
    },

    archivedAt: { type: Date },
  },
  { timestamps: true }
);

LiveSessionSchema.pre('validate', function (next) {
  if (this.endAt && this.startAt && this.endAt <= this.startAt) {
    return next(new Error('endAt must be after startAt'));
  }
  next();
});

LiveSessionSchema.methods.isJoinableNow = function (at = new Date(), joinWindowMinutes = 10) {
  const openFrom = new Date(this.startAt.getTime() - joinWindowMinutes * 60 * 1000);
  const openUntil = new Date(this.endAt.getTime() + 5 * 60 * 1000);
  return this.status !== 'canceled' && at >= openFrom && at <= openUntil;
};

module.exports = model('LiveSession', LiveSessionSchema);
