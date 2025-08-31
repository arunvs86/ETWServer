const { Schema, model, Types } = require('mongoose');

const AttachmentSchema = new Schema(
  {
    kind: { type: String, enum: ['image', 'file', 'link'], default: 'file' },
    url:  { type: String, required: true },
    name: { type: String, default: '' }
  },
  { _id: false }
);

const MessageSchema = new Schema(
  {
    conversationId: { type: Types.ObjectId, ref: 'Conversation', required: true, index: true },
    senderId:       { type: Types.ObjectId, ref: 'User',         required: true, index: true },

    type: { type: String, enum: ['text', 'image', 'file', 'system'], default: 'text' },
    body: { type: String, default: '' },

    attachments: { type: [AttachmentSchema], default: [] },

    // simple reply threading
    replyToMessageId: { type: Types.ObjectId, ref: 'Message' },

    editedAt:  { type: Date },
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Hot path: list messages in a conversation chronologically
MessageSchema.index({ conversationId: 1, createdAt: 1 });

// Rollup: update conversation lastMessage* on save
MessageSchema.post('save', async function () {
  const Conversation = require('./Conversation');
  await Conversation.findByIdAndUpdate(this.conversationId, {
    lastMessageAt: this.createdAt,
    lastMessageId: this._id
  });
});

module.exports = model('Message', MessageSchema);
