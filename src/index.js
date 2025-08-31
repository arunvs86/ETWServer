// // require('dotenv').config();
// // const express = require('express');
// // const helmet = require('helmet');
// // const cookieParser = require('cookie-parser');
// // const morgan = require('morgan');
// // const cors = require('cors');
// // const connectDB = require('./config/db');

// // const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';

// // const app = express();

// // // --- security & logs ---
// // app.use(helmet());
// // app.use(morgan('dev'));

// // // --- CORS (credentials, no "*" routes) ---
// // app.use(cors({
// //   origin: FRONTEND,
// //   credentials: true,
// //   methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
// //   allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
// //   optionsSuccessStatus: 204,
// // }));



// // // Fast preflight response (avoid app.options('*', ...))
// // app.use((req, res, next) => {
// //   if (req.method === 'OPTIONS') return res.sendStatus(204);
// //   next();
// // });

// // const stripeWebhookRouter = require('../src/routes/webhooks.routes');
// // app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRouter);

// // // --- parsers ---
// // app.use(express.json());
// // app.use(cookieParser());

// // // --- dev auth shim (after cookie parsing) ---
// // const devAuth = require('./middlewares/devAuth');
// // app.use(devAuth);

// // // --- routes ---
// // app.use('/auth', require('./routes/auth'));

// // app.get('/', (req, res) => res.json({ ok: true }));

// // app.use('/courses', require('./routes/course.routes'));

// // app.use('/instructor', require('./routes/instructor.course.routes'));
// // app.use('/instructor', require('./routes/instructor.structure.routes'));

// // app.use('/uploads', require('./routes/upload.routes'));

// // app.use('/', require('./routes/membership.routes'));
// // app.use('/', require('./routes/webhooks.routes'));
// // app.use('/', require('./routes/enrollment.routes'));
// // app.use('/', require('./routes/me.courses.routes'));
// // app.use('/', require('./routes/me.progress.routes'));

// // app.use('/me', require('./routes/me.instructor.routes'));
// // app.use('/admin', require('./routes/admin.instructor.routes'));

// // // --- start ---
// // connectDB(process.env.MONGO_URI)
// //   .then(() =>
// //     app.listen(process.env.PORT, () =>
// //       console.log(`API on http://localhost:${process.env.PORT}`)
// //     )
// //   )
// //   .catch(err => { console.error(err); process.exit(1); });

// require('dotenv').config();
// const express = require('express');
// const helmet = require('helmet');
// const cookieParser = require('cookie-parser');
// const morgan = require('morgan');
// const cors = require('cors');
// const connectDB = require('./config/db');
// const path = require('path');                 

// const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';
// const app = express();

// // --- security & logs ---
// app.use(helmet());
// app.use(morgan('dev'));

// // --- CORS ---
// app.use(cors({
//   origin: FRONTEND,
//   credentials: true,
//   methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
//   allowedHeaders: [
//     'Content-Type',
//     'Authorization',
//     'X-Requested-With',
//     'Cache-Control',  // <— add
//     'Pragma',         // <— add
//     'Expires'         // <— add
//   ],
//   optionsSuccessStatus: 204,
// }));
// // Fast preflight
// app.use((req, res, next) => {
//   if (req.method === 'OPTIONS') return res.sendStatus(204);
//   next();
// });

// /** ================================
//  *  STRIPE WEBHOOK — mount FIRST
//  *  raw body + NO auth + NO json
//  *  ================================ */
// const stripeCtrl = require('./controllers/stripeWebhook.controller');
// app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeCtrl.handle);

// // --- parsers (safe after webhook) ---
// app.use(express.json());
// app.use(cookieParser());

// // --- dev auth shim: SKIP webhooks ---
// const devAuth = require('./middlewares/devAuth');
// app.use((req, res, next) => {
//   if (req.path.startsWith('/webhooks/stripe')) return next();
//   return devAuth(req, res, next);
// });

// /** STATIC FILES for uploaded media */
// app.use('/files', express.static(path.join(__dirname, '..', 'uploads'))); 

// /** UPLOADS (multer) */
// app.use('/uploads', require('./routes/upload.routes')); 

// // --- routes ---
// app.use('/auth', require('./routes/auth'));
// app.get('/', (req, res) => res.json({ ok: true }));
// app.use('/courses', require('./routes/course.routes'));
// app.use('/instructor', require('./routes/instructor.course.routes'));
// app.use('/instructor', require('./routes/instructor.structure.routes'));
// app.use('/uploads', require('./routes/upload.routes'));
// app.use('/', require('./routes/membership.routes'));

// app.use('/', require('./routes/enrollment.routes'));
// app.use('/', require('./routes/me.courses.routes'));
// app.use('/', require('./routes/me.progress.routes'));
// app.use('/me', require('./routes/me.instructor.routes'));
// app.use('/admin', require('./routes/admin.instructor.routes'));
// app.use('/', require('./routes/course.purchase.routes'));
// app.use('/', require('./routes/me.courseAccess.routes'));
// app.use('/instructor/mock', require('./routes/instructor.quiz.routes'));
// app.use('/instructor/mock', require('./routes/instructor.quizquestions.routes'));
// app.use('/learn', require('./routes/learn.routes'));

// app.use('/api', require('./routes/public.quiz.routes'));
// app.use('/api', require('./routes/public.quizPlay.routes'));
// const liveSessionRoutes = require('./routes/liveSession.routes');
// app.use('/live-sessions', liveSessionRoutes);
// const meLiveSessions = require('./routes/me.liveSessions.routes');
// app.use(meLiveSessions); 




// connectDB(process.env.MONGO_URI)
//   .then(() =>
//     app.listen(process.env.PORT, () =>
//       console.log(`API on http://localhost:${process.env.PORT}`)
//     )
//   )
//   .catch(err => { console.error(err); process.exit(1); });


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

// LIVE SESSIONS
const liveSessionRoutes = require('./routes/liveSession.routes');
app.use('/live-sessions', attachUserIfPresent, liveSessionRoutes);

const meLiveSessions = require('./routes/me.liveSessions.routes');
app.use(meLiveSessions);

app.use('/discussions', discussionsRoutes);

app.use('/instructor', require('./routes/instructor.resource.routes'));
app.use('/resources',  require('./routes/resource.routes'));


app.use(require('./routes/coursePurchase.routes'));
const resourcePurchaseRoutes = require('./routes/resourcePurchase.routes');
app.use('/', resourcePurchaseRoutes);  


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


// start
connectDB(process.env.MONGO_URI)
  .then(() => app.listen(process.env.PORT, () => console.log(`API on http://localhost:${process.env.PORT}`)))
  .catch(err => { console.error(err); process.exit(1); });
