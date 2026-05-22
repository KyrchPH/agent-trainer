import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db.js';
import { promoteWinningSuggestion } from '../lib/promote.js';

export const qaRouter = Router();

qaRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const search = String(req.query.search ?? '').trim();
    const offset = (page - 1) * pageSize;

    const pool = getPool();
    const filterParams: Array<string> = [];
    let where = '';
    if (search) {
      where = 'WHERE question LIKE ? OR answer LIKE ?';
      filterParams.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await pool.query(
      `SELECT id, question, answer, created_at, updated_at
       FROM qa_entries
       ${where}
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`,
      [...filterParams, pageSize, offset]
    );
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM qa_entries ${where}`,
      filterParams
    );
    const total = Number((countRows as Array<{ total: number }>)[0]?.total ?? 0);

    res.json({ data: rows, page, pageSize, total });
  } catch (err) {
    next(err);
  }
});

const suggestRequest = z.object({
  question: z.string().min(1).max(4000),
  suggested_answer: z.string().min(1).max(8000),
  submitted_by: z.string().min(1).max(120)
});

qaRouter.post('/suggest', async (req, res, next) => {
  try {
    const parsed = suggestRequest.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const { question, suggested_answer, submitted_by } = parsed.data;
    const pool = getPool();

    await pool.query(
      'INSERT INTO suggestions (question, answer, submitted_by) VALUES (?, ?, ?)',
      [question, suggested_answer, submitted_by]
    );

    const result = await promoteWinningSuggestion(question);

    res.json({
      submitted: true,
      promoted: result?.promoted ?? false,
      current_answer: result?.answer ?? null
    });
  } catch (err) {
    next(err);
  }
});
