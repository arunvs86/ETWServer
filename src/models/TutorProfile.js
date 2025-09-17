// models/TutorProfile.js
const { Schema, model, Types } = require('mongoose');

const TutorProfileSchema = new Schema({
  userId:          { type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true },

  // public card
  headline:        { type: String, default: '' },
  bio:             { type: String, default: '' },
  subjects:        { type: [String], default: [] },          // e.g. ["UCAT","Maths","OSCE"]
  languages:       { type: [String], default: ['en'] },

  // scheduling
  timezone:        { type: String, default: 'Europe/London' },

  // pricing (minor units: 4500 => £45.00)
  hourlyRateMinor: { type: Number, default: 3000, min: 0 },
  currency:        { type: String, default: 'GBP' },

  // listing / delivery
  meetingProvider: { type: String, enum: ['zoom','google_meet','custom'], default: 'custom' },
  meetingNote:     { type: String, default: '' },
  isListed:        { type: Boolean, default: true },

  // ratings (to be populated later)
  ratingAvg:       { type: Number, default: 0, min: 0, max: 5 },
  ratingCount:     { type: Number, default: 0, min: 0 },
}, { timestamps: true });

module.exports = model('TutorProfile', TutorProfileSchema);
