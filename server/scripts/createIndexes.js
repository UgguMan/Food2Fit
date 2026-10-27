require('../config/env');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const models = require('../models');

(async () => {
  try {
    await connectDB();
    // createIndexes adds missing indexes; never drops existing indexes or data.
    for (const model of Object.values(models)) {
      await model.createIndexes();
      console.log(`Indexes ready: ${model.modelName}`);
    }
  } catch {
    console.error('Index setup failed. Check database access and existing duplicate records.');
    process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
})();
