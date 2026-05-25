import { Router } from 'express';
import { getPool } from '../db.js';

export const accountRouter = Router();

// All endpoints here are scoped to a single user_name. This app has no auth,
// so the user_name comes from the client (localStorage) and is trusted; the
// destructive endpoints are intended for the owner of that name to use via
// the in-chat slash commands.

// Clear all messages for one user. message_votes ON DELETE CASCADE drops
// every vote that was attached to a deleted message — including votes cast
// on those messages by *other* users. We don't re-run promotion afterwards;
// the next vote / suggestion on any affected question will trigger it.
accountRouter.delete('/messages', async (req, res, next) => {
  try {
    const userName = String(req.query.user_name ?? '').trim();
    if (!userName) {
      return res.status(400).json({ error: 'user_name query param is required' });
    }
    const pool = getPool();
    const [result] = await pool.query('DELETE FROM messages WHERE user_name = ?', [userName]);
    const deleted = (result as { affectedRows: number }).affectedRows ?? 0;
    res.json({ deleted_messages: deleted });
  } catch (err) {
    next(err);
  }
});

// Clear all votes a user has cast on any message (their own or others').
accountRouter.delete('/votes', async (req, res, next) => {
  try {
    const voterName = String(req.query.voter_name ?? '').trim();
    if (!voterName) {
      return res.status(400).json({ error: 'voter_name query param is required' });
    }
    const pool = getPool();
    const [result] = await pool.query(
      'DELETE FROM message_votes WHERE voter_name = ?',
      [voterName]
    );
    const deleted = (result as { affectedRows: number }).affectedRows ?? 0;
    res.json({ deleted_votes: deleted });
  } catch (err) {
    next(err);
  }
});

// Full account wipe: messages (votes cascade), the user's votes cast on
// *other* people's messages, and any suggestions they submitted. Ordered to
// minimise dangling references even though there are no FKs from votes/
// suggestions to user_name.
accountRouter.delete('/', async (req, res, next) => {
  try {
    const userName = String(req.query.user_name ?? '').trim();
    if (!userName) {
      return res.status(400).json({ error: 'user_name query param is required' });
    }
    const pool = getPool();
    const [msgRes] = await pool.query('DELETE FROM messages WHERE user_name = ?', [userName]);
    const [voteRes] = await pool.query(
      'DELETE FROM message_votes WHERE voter_name = ?',
      [userName]
    );
    const [sugRes] = await pool.query(
      'DELETE FROM suggestions WHERE submitted_by = ?',
      [userName]
    );
    res.json({
      deleted_messages: (msgRes as { affectedRows: number }).affectedRows ?? 0,
      deleted_votes: (voteRes as { affectedRows: number }).affectedRows ?? 0,
      deleted_suggestions: (sugRes as { affectedRows: number }).affectedRows ?? 0
    });
  } catch (err) {
    next(err);
  }
});

// Distinct user_names that appear in the messages table, alphabetically.
// Used by the `/users` slash command.
accountRouter.get('/users', async (_req, res, next) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT DISTINCT user_name FROM messages ORDER BY user_name ASC'
    );
    const users = (rows as Array<{ user_name: string }>).map(r => r.user_name);
    res.json({ users });
  } catch (err) {
    next(err);
  }
});
