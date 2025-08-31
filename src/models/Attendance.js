const { Schema, model, Types } = require('mongoose');

const AttendanceSchema = new Schema(
  {
    liveSessionId: { type: Types.ObjectId, ref: 'LiveSession', required: true, index: true },
    userId:        { type: Types.ObjectId, ref: 'User',        required: true, index: true },

    joinAt:  { type: Date, required: true, index: true },
    leaveAt: { type: Date }, // can be null if still live / abrupt disconnect

    // computed for convenience; we recompute when leaveAt is set
    durationSec: { type: Number, default: 0, min: 0 },

    // where this record came from
    source: { type: String, enum: ['zoom', 'manual'], default: 'manual', index: true },
    raw:    { type: Schema.Types.Mixed } // optional: store provider payload fragment
  },
  { timestamps: true }
);

// multiple joins per user in a single session are allowed (rejoins)
// hot query path:
AttendanceSchema.index({ liveSessionId: 1, userId: 1, joinAt: 1 });

// helper to (re)compute duration
AttendanceSchema.methods.recomputeDuration = function () {
    console.log("Left: ",this.leaveAt)
    console.log("Joined: ", this.joinAt)
  if (this.leaveAt && this.leaveAt > this.joinAt) {
    this.durationSec = Math.floor((this.leaveAt.getTime() - this.joinAt.getTime()) / 1000);
  } else {
    this.durationSec = 0;
  }
};

AttendanceSchema.pre('save', function (next) {
  this.recomputeDuration();
  next();
});

module.exports = model('Attendance', AttendanceSchema);
