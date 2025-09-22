
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const { attachUserIfPresent } = require('./middlewares/auth');
const discussionsRoutes = require('./routes/discussions.routes');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';
const app = express();

// security & logs
app.use(helmet());
app.use(morgan('dev'));

// CORS
// app.use(cors({
//   origin: FRONTEND,
//   credentials: true,
//   methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
//   allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Cache-Control','Pragma','Expires'],
//   optionsSuccessStatus: 204,
// }));
// app.use((req, res, next) => { if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Cache-Control','Pragma','Expires'],
}));
app.use((req, res, next) => { if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });

// LIVE SESSIONS
const liveSessionRoutes = require('./routes/liveSession.routes');
app.use('/live-sessions', liveSessionRoutes);

// --- STRIPE WEBHOOK (FIRST, raw) ---
const stripeCtrl = require('./controllers/stripeWebhook.controller');
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeCtrl.handle);

// parsers
app.use(express.json());
app.use(cookieParser());

// dev auth shim (skip webhook)
// const devAuth = require('./middlewares/devAuth');
// app.use((req, res, next) => {
//   if (req.path.startsWith('/webhooks/stripe')) return next();
//   return devAuth(req, res, next);
// });



const devAuth = require('./middlewares/devAuth');
app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks/stripe')) return next();
  return devAuth(req, res, next); // no NODE_ENV check for demo
});
console.log('[server] mounting /api me.quizAttempts.routes');
app.use('/api', require('./routes/me.quizAttempts.routes'));

// static files for uploaded media
app.use('/files', express.static(path.join(__dirname, '..', 'uploads')));

// uploads (multer) — mount ONCE
app.use('/uploads', require('./routes/upload.routes'));

// routes
app.use('/auth', require('./routes/auth'));
app.get('/', (req, res) => res.json({ ok: true }));
app.get('/healthz', (_, res) => res.send('ok'));

app.use('/courses', require('./routes/course.routes'));
app.use('/instructor', require('./routes/instructor.course.routes'));
app.use('/instructor', require('./routes/instructor.structure.routes'));

app.use('/', require('./routes/membership.routes'));
app.use('/', require('./routes/enrollment.routes'));
app.use('/', require('./routes/me.courses.routes'));
app.use('/', require('./routes/me.progress.routes'));
app.use('/me', require('./routes/me.instructor.routes'));
app.use('/admin', require('./routes/admin.instructor.routes'));
app.use('/', require('./routes/course.purchase.routes'));
app.use('/', require('./routes/me.courseAccess.routes'));
app.use('/instructor/mock', require('./routes/instructor.quiz.routes'));
app.use('/instructor/mock', require('./routes/instructor.quizquestions.routes'));
app.use('/learn', require('./routes/learn.routes'));

app.use('/api', require('./routes/public.quiz.routes'));
app.use('/api', require('./routes/public.quizPlay.routes'));
app.use('/api', require('./routes/me.quizAttempts.routes'));



const meLiveSessions = require('./routes/me.liveSessions.routes');
app.use(meLiveSessions);

app.use('/discussions', discussionsRoutes);

app.use('/instructor', require('./routes/instructor.resource.routes'));
app.use('/resources',  require('./routes/resource.routes'));


app.use(require('./routes/coursePurchase.routes'));
const resourcePurchaseRoutes = require('./routes/resourcePurchase.routes');
app.use('/', resourcePurchaseRoutes);  
app.use('/api', require('./routes/payments.routes'));


app.use(require('./routes/purchaseSync.routes'));  
const publicQuizRoutes = require('./routes/public.quiz.routes');
app.use('/', publicQuizRoutes);

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
    return res.status(status).json({ error: message, stack: err.stack });
  }
  return res.status(status).json({ error: message });
});

// -------- Tutoring: public list/detail --------
const tutorsRouter = require('./routes/tutors.routes');
app.use('/tutors', tutorsRouter);


// -------- Tutoring: availability, sessions, checkout, manage (all under /) --------
app.use('/', require('./routes/tutorAvailability.routes'));
app.use('/', require('./routes/sessions.routes'));
app.use('/', require('./routes/checkout.routes'));
app.use('/', require('./routes/tutorManage.routes'));

// -------- Tutoring: "me" endpoints (profile & availability under /me) --------
const meTutorRouter = require('./routes/meTutor.routes');
app.use('/me', meTutorRouter);

const ebooksRouter = require('./routes/ebook.routes');
app.use('/ebooks', ebooksRouter);

// Checkout / publish
const ebookPurchaseRoutes = require('./routes/ebookPurchase.routes');
app.use('/', ebookPurchaseRoutes);

// Instructor ebooks CRUD
const instructorEbooksRoutes = require('./routes/instructorEbooks.routes');
app.use('/instructor/ebooks', instructorEbooksRoutes);


// -------- Error handler --------
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
    return res.status(status).json({ error: message, stack: err.stack });
  }
  return res.status(status).json({ error: message });
});

console.log(
  'Loaded MONGO_URI =',
  (process.env.MONGO_URI || '').replace(/\/\/[^:]+:[^@]+@/, '//<user>:<pw>@')
);

// -------- Start --------
connectDB(process.env.MONGO_URI)
  .then(() =>
    app.listen(process.env.PORT, () =>
      console.log(`API on http://localhost:${process.env.PORT}`)
    )
  )
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

// -------- Jobs --------
const { startHoldsCleanup } = require('./jobs/holdsCleanup');
startHoldsCleanup();
