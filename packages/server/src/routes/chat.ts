import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db.js';

export const chatRouter = Router();

const chatRequest = z.object({
  question: z.string().min(1).max(4000),
  user_name: z.string().min(1).max(120).optional()
});

chatRouter.post('/', async (req, res, next) => {
  try {
    const parsed = chatRequest.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const { question, user_name } = parsed.data;
    const pool = getPool();

    const [rows] = await pool.query(
      'SELECT id, question, answer FROM qa_entries WHERE question LIKE ? OR answer LIKE ? ORDER BY updated_at DESC LIMIT 5',
      [`%${question}%`, `%${question}%`]
    );
    const context = rows as Array<{ id: number; question: string; answer: string }>;

    res.json({
      answer: null,
      context,
      user_name: user_name ?? null
    });
  } catch (err) {
    next(err);
  }
});
