require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
const reportRoutes = require('./routes/reports.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ✅ ADD THIS NEW ROUTE
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the Smart Community Security API',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      users: '/api/users',
      reports: '/api/reports',
      admin: '/api/admin',
    },
  });
});

// Existing health route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'smart-community-security-backend',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.code === 11000) {
    return res
      .status(409)
      .json({ error: 'A record with these details already exists' });
  }

  res
    .status(err.status || 500)
    .json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Smart Community Security backend running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });