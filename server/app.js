const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const connectDB = require('./config/db');
require('./models');
const authRoutes = require('./routes/auth');
const { errorHandler } = require('./middleware/errors');

const app = express();
app.disable('x-powered-by');
// Vercel overwrites X-Forwarded-For at its edge. Local requests trust no proxy.
if (process.env.VERCEL === '1') app.set('trust proxy', 1);
app.use(helmet());

const allowedOrigins = new Set([env.clientUrl]);
if (!env.isProduction) {
  allowedOrigins.add('http://localhost:5173');
  allowedOrigins.add('http://127.0.0.1:5173');
}
app.use(cors({
  origin(origin, callback) {
    // Requests without Origin include server-to-server calls and health probes.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    const error = new Error('This origin is not allowed.');
    error.status = 403;
    error.code = 'ORIGIN_NOT_ALLOWED';
    callback(error);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

// Every API request awaits the shared connection before reaching its handler.
app.use('/api', async (req, res, next) => {
  try { await connectDB(); next(); } catch (error) { next(error); }
});

app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'ok', service: 'food2fit-api', database: 'connected' });
});
app.use('/api/auth', authRoutes);
app.use('/api/fitness', require('./routes/fitness'));
app.use('/api/recipes', require('./routes/recipes'));

app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
});

app.use(errorHandler);

module.exports = app;
