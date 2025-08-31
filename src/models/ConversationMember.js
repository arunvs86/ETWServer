const { Schema, model, Types } = require('mongoose');

const ConversationMemberSchema = new Schema(
  {
    conversationId: { type: Types.ObjectId, ref: 'Conversation', required: true, index: true },
    userId:         { type: Types.ObjectId, ref: 'User',         required: true, index: true },

    role: { type: String, enum: ['member', 'admin'], default: 'member' },

    joinedAt:   { type: Date, default: () => new Date() },
    lastReadAt: { type: Date },
    isMuted:    { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// One row per (conversation,user)
ConversationMemberSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

module.exports = model('ConversationMember', ConversationMemberSchema);
