const { Schema, model, Types } = require('mongoose');

const ConversationSchema = new Schema(
  {
    type: { type: String, enum: ['dm', 'group', 'course'], required: true, index: true },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true, index: true },

    title: { type: String, default: '' },       // used for group/course chats
    courseId: { type: Types.ObjectId, ref: 'Course' }, // when type='course'

    // For DMs: canonical key "smallerId:largerId" to avoid duplicates
    dmKey: { type: String, index: true },

    // rollups
    lastMessageAt: { type: Date, index: true },
    lastMessageId: { type: Types.ObjectId, ref: 'Message' },

    archivedAt: { type: Date }
  },
  { timestamps: true }
);

// Unique only for DMs
ConversationSchema.index(
  { type: 1, dmKey: 1 },
  { unique: true, partialFilterExpression: { type: 'dm', dmKey: { $type: 'string' } } }
);

module.exports = model('Conversation', ConversationSchema);
