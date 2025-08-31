// const mongoose = require('mongoose');

// module.exports = async function connectDB(uri) {
//   mongoose.set('strictQuery', true);
//   await mongoose.connect(uri);
//   console.log('Mongo connected');
// };

const mongoose = require('mongoose');

module.exports = async function connectDB(uri) {
  try {
    await mongoose.connect(uri, {
      dbName: 'edulearn',  // force the db
      serverSelectionTimeoutMS: 10000,
    });
    console.log('[Mongo] connected');
  } catch (err) {
    console.error('[Mongo] error:', err.message);
    throw err;
  }
};
