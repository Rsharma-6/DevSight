import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db';
import projectRoutes from './routes/projects';
import incidentRoutes from './routes/incidents';
import webhookRoutes from './routes/webhooks';
import searchRoutes from './routes/search';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));

// Raw body needed for webhook signature verification
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

app.use(express.json());

app.use('/api/projects', projectRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/search', searchRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

connectDB().then(() => {
  app.listen(PORT, () => console.log(`DevSight backend running on port ${PORT}`));
}).catch((err) => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
