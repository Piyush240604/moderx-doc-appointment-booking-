import express from 'express';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import connectDB from './config/database.js';
import errorHandler from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import doctorRoutes from './routes/doctorRoutes.js';
import slotRoutes from './routes/slotRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import expirePendingBookings from './jobs/bookingExpiry.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. Database Connection (Optimized for Serverless) ---
// We connect immediately when the file loads. 
// Mongoose handles connection buffering (queuing requests until connected).
connectDB().catch(err => console.error("Database connection error:", err));

// --- 2. Middleware ---
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(null, true); // Strict: Replace with callback(new Error('Not allowed by CORS')) for production security
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. Swagger Configuration ---
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Doctor Appointment Booking API',
      version: '1.0.0',
      description: 'API for managing doctor appointments',
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
             ? `https://${process.env.VERCEL_URL}` // Auto-detected Vercel URL
             : `http://localhost:${PORT}`,
        description: 'Server',
      },
    ],
  },
  apis: [join(__dirname, './routes/*.js')],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --- 4. Routes ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Replaced node-cron with an HTTP endpoint
// You can ping this URL using https://cron-job.org or Vercel Cron
app.get('/api/cron/expire-bookings', async (req, res) => {
  try {
    await expirePendingBookings();
    res.json({ status: 'success', message: 'Expired pending bookings checked' });
  } catch (error) {
    console.error('Error in manual expiry trigger:', error);
    res.status(500).json({ error: 'Failed to expire bookings' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/bookings', bookingRoutes);

// Error handling (must be last)
app.use(errorHandler);

// --- 5. Start Server (Conditional) ---
// Only listen if running locally. Vercel handles the rest via export.
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running locally on http://localhost:${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
  });
}

// Required for Vercel
export default app;
