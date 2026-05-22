import { getPool } from '../db.js';

export interface PromotionResult {
  answer: string;
  promoted: boolean;
  net_score: number;
}

// For a given question text, pick the answer with the highest net vote score
// (upvotes - downvotes), tiebreak by most recent contribution, and upsert it
// into qa_entries.
//
// Candidates are gathered from two sources and grouped by answer text
// (case- and accent-insensitive via the table collation):
//
//   1. Each AI assistant message whose immediately-prior message in the same
//      conversation is a user message with this question. Votes come from
//      message_votes; only messages with at least one vote count, so an
//      unvoted "I don't know" cannot auto-promote itself.
//
//   2. Each user-submitted suggestion stored in `suggestions` for this
//      question. Each distinct submitter counts as one implicit upvote;
//      suggestions cannot be downvoted (they are not visible to others).
//
// Same answer text from both sources is summed.
export async function promoteWinningSuggestion(question: string): Promise<PromotionResult | null> {
  const pool = getPool();

  const [rows] = await pool.query(
    `WITH paired AS (
       SELECT m.id,
              m.role,
              m.content,
              m.created_at,
              LAG(m.content) OVER (PARTITION BY m.user_name ORDER BY m.created_at, m.id) AS prev_content,
              LAG(m.role)    OVER (PARTITION BY m.user_name ORDER BY m.created_at, m.id) AS prev_role
       FROM messages m
     ),
     ai_candidates AS (
       SELECT p.content AS answer,
              SUM(CASE WHEN mv.vote_type = 'up'   THEN 1 ELSE 0 END) AS upvotes,
              SUM(CASE WHEN mv.vote_type = 'down' THEN 1 ELSE 0 END) AS downvotes,
              MAX(p.created_at) AS recent
       FROM paired p
       INNER JOIN message_votes mv ON mv.message_id = p.id
       WHERE p.role = 'assistant'
         AND p.prev_role = 'user'
         AND p.prev_content = ?
       GROUP BY p.content
     ),
     user_candidates AS (
       SELECT s.answer,
              COUNT(DISTINCT s.submitted_by) AS upvotes,
              0 AS downvotes,
              MAX(s.created_at) AS recent
       FROM suggestions s
       WHERE s.question = ?
       GROUP BY s.answer
     ),
     combined AS (
       SELECT answer, upvotes, downvotes, recent FROM ai_candidates
       UNION ALL
       SELECT answer, upvotes, downvotes, recent FROM user_candidates
     )
     SELECT answer,
            CAST(SUM(upvotes)   AS SIGNED) - CAST(SUM(downvotes) AS SIGNED) AS net_score,
            MAX(recent) AS recent
     FROM combined
     GROUP BY answer
     ORDER BY net_score DESC, recent DESC
     LIMIT 1`,
    [question, question]
  );

  const winner = (rows as Array<{ answer: string; net_score: number; recent: string }>)[0];
  if (!winner) return null;

  const [existing] = await pool.query(
    'SELECT id, answer FROM qa_entries WHERE question = ? LIMIT 1',
    [question]
  );
  const existingRow = (existing as Array<{ id: number; answer: string }>)[0];

  if (existingRow) {
    if (existingRow.answer === winner.answer) {
      return { answer: winner.answer, promoted: false, net_score: Number(winner.net_score) };
    }
    await pool.query('UPDATE qa_entries SET answer = ? WHERE id = ?', [
      winner.answer,
      existingRow.id
    ]);
    return { answer: winner.answer, promoted: true, net_score: Number(winner.net_score) };
  }

  await pool.query('INSERT INTO qa_entries (question, answer) VALUES (?, ?)', [
    question,
    winner.answer
  ]);
  return { answer: winner.answer, promoted: true, net_score: Number(winner.net_score) };
}

// Returns the user-message text that immediately preceded the given assistant
// message in the same conversation, i.e. "the question that this AI reply was
// answering." Returns null if the message id doesn't exist or has no prior
// user message in its conversation.
export async function getQuestionForAssistantMessage(messageId: number): Promise<string | null> {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT (
       SELECT prev.content
       FROM messages prev
       WHERE prev.user_name = m.user_name
         AND prev.role = 'user'
         AND prev.created_at < m.created_at
       ORDER BY prev.created_at DESC, prev.id DESC
       LIMIT 1
     ) AS question
     FROM messages m
     WHERE m.id = ? AND m.role = 'assistant'`,
    [messageId]
  );
  const row = (rows as Array<{ question: string | null }>)[0];
  return row?.question ?? null;
}
