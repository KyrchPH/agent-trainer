import { getPool } from '../db.js';
import { depersonalizeAnswer, fetchUserNames } from './personalize.js';

export interface PromotionResult {
  answer: string;
  promoted: boolean;
  net_score: number;
}

// For a given question text, pick the answer with the highest net vote score
// (upvotes - downvotes), tiebreak by most recent contribution, and upsert it
// into qa_entries.
//
// Promotion rules:
//   - A candidate's score is its explicit votes only: ups - downs. There is
//     NO implicit "+1 from submitter" for suggestions — a brand-new
//     suggestion sits at 0/0.
//   - Any candidate with net_score >= 0 qualifies for promotion. A tied-at-
//     zero candidate still wins if there's nothing better; only a NET
//     NEGATIVE candidate (community rejected) is excluded.
//   - Among qualifying candidates, highest net wins. Ties go to the most
//     recent contribution (newer suggestion replaces older one at the same
//     score).
//   - If no candidate qualifies (everything has net < 0, or no candidates
//     exist), the qa_entries row for this question is deleted.
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
//      question. Score comes purely from `suggestion_votes` (no implicit
//      submitter +1). The server still rejects self-votes so submitters
//      can't promote their own work artificially.
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
              SUM(CASE WHEN sv.vote_type = 'up'   THEN 1 ELSE 0 END) AS upvotes,
              SUM(CASE WHEN sv.vote_type = 'down' THEN 1 ELSE 0 END) AS downvotes,
              MAX(s.created_at) AS recent
       FROM suggestions s
       LEFT JOIN suggestion_votes sv ON sv.suggestion_id = s.id
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
     HAVING net_score >= 0
     ORDER BY net_score DESC, recent DESC
     LIMIT 1`,
    [question, question]
  );

  const winner = (rows as Array<{ answer: string; net_score: number; recent: string }>)[0];
  if (!winner) {
    // No qualifying candidate. Either there are zero candidates, or every
    // candidate is at net_score < 0 (community explicitly rejected them).
    // Remove any previously promoted qa_entry so the training set only
    // contains non-rejected answers. A 0/0 suggestion still qualifies and
    // wins, so this branch only fires on outright rejection or empty pools.
    await pool.query('DELETE FROM qa_entries WHERE question = ?', [question]);
    return null;
  }

  // Depersonalise before writing: any user names baked into the winning
  // answer get swapped to `<name>` placeholders so the qa_entries row is
  // portable across viewers. The serve-time path (chat.ts) rehydrates back
  // to the current viewer's name. We compare BOTH sides depersonalised
  // when deciding "is this the same answer?", which (a) lets us upgrade
  // legacy rows from baked-in to placeholder form on the next promotion,
  // and (b) avoids spurious UPDATEs when the only difference is a name.
  const knownNames = await fetchUserNames();
  const newAnswer = depersonalizeAnswer(winner.answer, knownNames);

  const [existing] = await pool.query(
    'SELECT id, answer FROM qa_entries WHERE question = ? LIMIT 1',
    [question]
  );
  const existingRow = (existing as Array<{ id: number; answer: string }>)[0];

  if (existingRow) {
    const existingDepersonalised = depersonalizeAnswer(existingRow.answer, knownNames);
    if (existingDepersonalised === newAnswer) {
      return { answer: newAnswer, promoted: false, net_score: Number(winner.net_score) };
    }
    await pool.query('UPDATE qa_entries SET answer = ? WHERE id = ?', [
      newAnswer,
      existingRow.id
    ]);
    return { answer: newAnswer, promoted: true, net_score: Number(winner.net_score) };
  }

  await pool.query('INSERT INTO qa_entries (question, answer) VALUES (?, ?)', [
    question,
    newAnswer
  ]);
  return { answer: newAnswer, promoted: true, net_score: Number(winner.net_score) };
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
