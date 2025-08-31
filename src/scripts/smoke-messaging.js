require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const ConversationMember = require('../models/ConversationMember');
const Message = require('../models/Message');

function dmKeyFor(aId, bId) {
  const [x, y] = [aId.toString(), bId.toString()].sort();
  return `${x}:${y}`;
}

async function ensureMember(conversationId, userId, role = 'member') {
  await ConversationMember.findOneAndUpdate(
    { conversationId, userId },
    { conversationId, userId, role },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const [student, instructor, admin] = await Promise.all([
      User.findOne({ email: 'demo.student@example.com' }),
      User.findOne({ email: 'demo.instructor@example.com' }),
      User.findOne({ email: 'demo.admin@example.com' })
    ]);
    if (!student || !instructor || !admin) throw new Error('Demo users missing. Run smoke-user.');

    // --- DM: student <-> instructor ---
    const key = dmKeyFor(student._id, instructor._id);
    const dm = await Conversation.findOneAndUpdate(
      { type: 'dm', dmKey: key },
      { type: 'dm', dmKey: key, createdBy: student._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await ensureMember(dm._id, student._id);
    await ensureMember(dm._id, instructor._id);

    const m1 = await Message.create({
      conversationId: dm._id,
      senderId: student._id,
      type: 'text',
      body: 'Hi! Could you review my UCAT strategy?'
    });
    const m2 = await Message.create({
      conversationId: dm._id,
      senderId: instructor._id,
      type: 'text',
      body: 'Sure—share your timing plan and I’ll give feedback.'
    });

    // --- Support group: student + admin ---
    const support = await Conversation.findOneAndUpdate(
      { type: 'group', title: 'Support' },
      { type: 'group', title: 'Support', createdBy: admin._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await ensureMember(support._id, admin._id, 'admin');
    await ensureMember(support._id, student._id, 'member');

    const s1 = await Message.create({
      conversationId: support._id,
      senderId: student._id,
      type: 'text',
      body: 'Hi admin, I need help with a billing question.'
    });

    // Fetch rollups
    const freshDM = await Conversation.findById(dm._id).lean();
    const freshSupport = await Conversation.findById(support._id).lean();

    console.log('✉️  DM created:', {
      id: dm._id.toString(),
      lastMessageAt: freshDM.lastMessageAt?.toISOString(),
      lastMessageId: freshDM.lastMessageId?.toString()
    });
    console.log('🆘 Support chat:', {
      id: support._id.toString(),
      lastMessageAt: freshSupport.lastMessageAt?.toISOString(),
      lastMessageId: freshSupport.lastMessageId?.toString()
    });
    console.log('Messages:', {
      dm: [m1.body, m2.body],
      support: [s1.body]
    });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-messaging failed:', err.message || err);
    process.exit(1);
  }
})();
