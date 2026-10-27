const { createHash } = require('node:crypto');
const RateLimit = require('../models/RateLimit');
const { AppError } = require('../middleware/errors');

class MongoRateLimitStore {
  constructor(prefix) { this.prefix = prefix; this.localKeys = false; }
  init(options) { this.windowMs = options.windowMs; }
  bucket(key) {
    const start = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    const digest = createHash('sha256').update(key).digest('hex');
    return { id: `${this.prefix}:${digest}:${start}`, resetTime: new Date(start + this.windowMs) };
  }
  async increment(key) {
    const { id, resetTime } = this.bucket(key);
    const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: resetTime } };
    try {
      let record;
      try {
        record = await RateLimit.findOneAndUpdate({ _id: id }, update, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: false }).lean();
      } catch (error) {
        // Concurrent first requests may race on the unique _id; retry as an update.
        if (error.code !== 11000) throw error;
        record = await RateLimit.findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' }).lean();
      }
      if (!record) throw new Error('Counter unavailable');
      return { totalHits: record.count, resetTime };
    } catch { throw new AppError(503, 'RATE_LIMIT_UNAVAILABLE', 'Please try again shortly.'); }
  }
  async decrement(key) {
    const { id } = this.bucket(key);
    await RateLimit.updateOne({ _id: id, count: { $gt: 0 } }, { $inc: { count: -1 } });
  }
  async resetKey(key) { await RateLimit.deleteOne({ _id: this.bucket(key).id }); }
}
module.exports = MongoRateLimitStore;
