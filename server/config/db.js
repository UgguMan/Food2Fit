const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('bufferCommands', false);
// Index creation must wait for a connected database, especially on cold starts.
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);

// Only connection infrastructure is cached in memory, never application data.
const cached = global._mongoose || (global._mongoose = { conn: null, promise: null });

async function connectDB() {
  if (!env.mongoUri) {
    const error = new Error('Database is not configured.');
    error.status = 503;
    error.code = 'DATABASE_UNAVAILABLE';
    throw error;
  }
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(env.mongoUri, {
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      socketTimeoutMS: 20000,
      autoIndex: false,
      autoCreate: false,
    }).then(async connection => {
      if (!env.isProduction) {
        for (const model of Object.values(require('../models'))) await model.createIndexes();
      }
      return connection;
    });
  }
  const pending = cached.promise;
  try {
    cached.conn = await pending;
    return cached.conn;
  } catch {
    cached.conn = null;
    const error = new Error('Database is temporarily unavailable.');
    error.status = 503;
    error.code = 'DATABASE_UNAVAILABLE';
    throw error;
  } finally {
    if (cached.promise === pending) cached.promise = null;
  }
}

module.exports = connectDB;
