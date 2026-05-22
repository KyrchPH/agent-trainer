import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { chatRouter } from './routes/chat.js';
import { qaRouter } from './routes/qa.js';
import { adminRouter } from './routes/admin.js';
import { ping } from './db.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await ping();
    res.json({ ok: true, db: 'connected' });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'disconnected', error: (err as Error).message });
  }
});

app.use('/api/chat', chatRouter);
app.use('/api/qa', qaRouter);
app.use('/api/admin', adminRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
