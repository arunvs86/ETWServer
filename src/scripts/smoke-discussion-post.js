require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const DiscussionThread = require('../models/DiscussionThread');
const DiscussionPost = require('../models/DiscussionPost');
const PostVote = require('../models/PostVote');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const [student, instructor] = await Promise.all([
      User.findOne({ email: 'demo.student@example.com' }),
      User.findOne({ email: 'demo.instructor@example.com' })
    ]);
    if (!student || !instructor) throw new Error('Demo users missing.');

    const [courseThread, lessonThread] = await Promise.all([
      DiscussionThread.findOne({ 'context.kind': 'course', title: 'General Q&A' }),
      DiscussionThread.findOne({ 'context.kind': 'lesson', title: 'Questions about this lesson' })
    ]);
    if (!courseThread || !lessonThread) throw new Error('Threads missing. Run smoke-discussion-thread.');

    // Student asks a question in the course thread
    const q = await DiscussionPost.findOneAndUpdate(
      { threadId: courseThread._id, authorId: student._id, body: 'How long should I spend on each UCAT section?' },
      { threadId: courseThread._id, authorId: student._id, body: 'How long should I spend on each UCAT section?' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Instructor answers in the lesson thread and marks as accepted
    const a = await DiscussionPost.findOneAndUpdate(
      { threadId: lessonThread._id, authorId: instructor._id, body: 'Aim ~8–10 mins; practice timing drills.' },
      {
        threadId: lessonThread._id,
        authorId: instructor._id,
        body: 'Aim ~8–10 mins; practice timing drills.',
        isAnswer: true,
        isInstructorAnswer: true
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Upvote the instructor answer by the student
    await PostVote.findOneAndUpdate(
      { postId: a._id, userId: student._id },
      { postId: a._id, userId: student._id, value: 1 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Fetch updated rollups
    const [updatedCourseThread, updatedLessonThread] = await Promise.all([
      DiscussionThread.findById(courseThread._id).lean(),
      DiscussionThread.findById(lessonThread._id).lean()
    ]);

    console.log('💭 question posted:', { id: q._id.toString(), thread: 'course', postsCount: updatedCourseThread.postsCount });
    console.log('✅ answer posted:', { id: a._id.toString(), isAnswer: true });
    console.log('👍 upvotes on answer:', (await (await require('../models/DiscussionPost').findById(a._id)).upvotesCount));

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-discussion-post failed:', err.message || err);
    process.exit(1);
  }
})();
