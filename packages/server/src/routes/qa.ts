import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { getPool } from '../db.js';
import { promoteWinningSuggestion } from '../lib/promote.js';

export const qaRouter = Router();

// Streams every qa_entries row as an .xlsx download. No pagination — the
// whole trained library goes into one sheet.
//
// Layout:
//   Row 1: branded title bar (merged A1:E1)
//   Row 2: subtitle / export metadata (merged A2:E2)
//   Row 3: column headers (frozen)
//   Row 4+: data, zebra-striped with thin borders, autofilter on headers,
//           landscape fit-to-width page setup
//
// Defined before the parametric `/` GET so router matching reaches it.
qaRouter.get('/export', async (_req, res, next) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, question, answer, created_at, updated_at
       FROM qa_entries
       ORDER BY updated_at DESC, id DESC`
    );
    const entries = rows as Array<{
      id: number;
      question: string;
      answer: string;
      created_at: Date | string;
      updated_at: Date | string;
    }>;

    // Brand palette (hex without alpha; ExcelJS expects ARGB so 'FF' prefix).
    const BRAND_PURPLE  = 'FF6D28D9'; // title bar — purple-700
    const HEADER_INDIGO = 'FF4F46E5'; // column headers — indigo-600
    const SUBTITLE_GREY = 'FF6B7280'; // subtitle text — gray-500
    const ZEBRA_GREY    = 'FFF3F4F6'; // alt-row fill — gray-100
    const BORDER_GREY   = 'FFE5E7EB'; // cell borders — gray-200
    const HEADER_BORDER = 'FFC7D2FE'; // header underline — indigo-200
    const WHITE         = 'FFFFFFFF';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'WiseAI';
    wb.created = new Date();
    const ws = wb.addWorksheet('Q&A Entries', {
      views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
      }
    });

    // Column widths.
    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 55;
    ws.getColumn(3).width = 70;
    ws.getColumn(4).width = 20;
    ws.getColumn(5).width = 20;

    // Row 1 — title bar.
    ws.mergeCells('A1:E1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'WiseAI — Q&A Training Library';
    titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: WHITE } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PURPLE } };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 34;

    // Row 2 — subtitle with export metadata.
    ws.mergeCells('A2:E2');
    const exportedAt = new Date();
    const dateStr = exportedAt.toISOString().slice(0, 10);
    const subCell = ws.getCell('A2');
    subCell.value = `Exported ${dateStr}  -  ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: SUBTITLE_GREY } };
    subCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(2).height = 20;

    // Row 3 — column headers.
    const headerLabels = ['ID', 'Question', 'Answer', 'Created At', 'Updated At'];
    const headerRow = ws.getRow(3);
    headerLabels.forEach((label, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = label;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_INDIGO } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top:    { style: 'thin',   color: { argb: HEADER_INDIGO } },
        bottom: { style: 'medium', color: { argb: HEADER_BORDER } },
        left:   { style: 'thin',   color: { argb: HEADER_INDIGO } },
        right:  { style: 'thin',   color: { argb: HEADER_INDIGO } }
      };
    });
    headerRow.height = 26;

    // Row 4+ — data, zebra-striped with thin borders.
    entries.forEach((e, idx) => {
      const rowNum = idx + 4;
      const row = ws.getRow(rowNum);
      row.getCell(1).value = e.id;
      row.getCell(2).value = e.question;
      row.getCell(3).value = e.answer;
      row.getCell(4).value = e.created_at instanceof Date ? e.created_at : new Date(e.created_at);
      row.getCell(5).value = e.updated_at instanceof Date ? e.updated_at : new Date(e.updated_at);

      const fill = idx % 2 === 0 ? WHITE : ZEBRA_GREY;
      for (let c = 1; c <= 5; c++) {
        const cell = row.getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        cell.border = {
          top:    { style: 'hair', color: { argb: BORDER_GREY } },
          bottom: { style: 'hair', color: { argb: BORDER_GREY } },
          left:   { style: 'hair', color: { argb: BORDER_GREY } },
          right:  { style: 'hair', color: { argb: BORDER_GREY } }
        };
        cell.font = { name: 'Calibri', size: 10 };
      }
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
      row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
      row.getCell(4).alignment = { horizontal: 'left', vertical: 'top' };
      row.getCell(5).alignment = { horizontal: 'left', vertical: 'top' };
      row.getCell(4).numFmt = 'yyyy-mm-dd hh:mm';
      row.getCell(5).numFmt = 'yyyy-mm-dd hh:mm';
    });

    // Autofilter dropdowns on the header row — only attach when there is at
    // least one data row, otherwise Excel complains about an empty range.
    if (entries.length > 0) {
      ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + entries.length, column: 5 } };
    }

    // Empty-state row so a freshly-installed DB still produces a readable file.
    if (entries.length === 0) {
      ws.mergeCells('A4:E4');
      const empty = ws.getCell('A4');
      empty.value = 'No Q&A entries yet. Train the agent in the chat to populate this list.';
      empty.font = { name: 'Calibri', size: 11, italic: true, color: { argb: SUBTITLE_GREY } };
      empty.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(4).height = 28;
    }

    // Print options: repeat header rows on every printed page.
    ws.pageSetup.printTitlesRow = '1:3';

    const filename = `wiseai-qa-${dateStr}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

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
  submitted_by: z.string().min(1).max(120),
  // Optional: the assistant message bubble the user clicked Suggest on.
  // When the submission wins promotion, the server overwrites that specific
  // bubble's stored `content` (+ from_qa_entries flag) so the change persists
  // through reloads. Omitted submissions still record + run promotion as
  // before, they just don't rewrite any historical message.
  target_message_id: z.number().int().positive().nullable().optional()
});

qaRouter.get('/suggestions', async (req, res, next) => {
  try {
    const question = String(req.query.question ?? '').trim();
    if (!question) {
      return res.status(400).json({ error: 'question query param is required' });
    }
    // viewer (optional) is the current user's name. Used to populate
    // `my_vote` on each row so the UI can show the viewer's vote state
    // without a second round trip.
    const viewer = String(req.query.viewer ?? '').trim();
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT s.id, s.answer, s.submitted_by, s.created_at, s.updated_at,
              COALESCE(uv.cnt, 0) AS upvotes,
              COALESCE(dv.cnt, 0) AS downvotes,
              myv.vote_type AS my_vote
       FROM suggestions s
       LEFT JOIN (
         SELECT suggestion_id, COUNT(*) AS cnt
         FROM suggestion_votes WHERE vote_type = 'up' GROUP BY suggestion_id
       ) uv ON uv.suggestion_id = s.id
       LEFT JOIN (
         SELECT suggestion_id, COUNT(*) AS cnt
         FROM suggestion_votes WHERE vote_type = 'down' GROUP BY suggestion_id
       ) dv ON dv.suggestion_id = s.id
       LEFT JOIN suggestion_votes myv
         ON myv.suggestion_id = s.id AND myv.voter_name = ?
       WHERE s.question = ?
       ORDER BY s.created_at DESC, s.id DESC`,
      [viewer || null, question]
    );
    res.json({ suggestions: rows });
  } catch (err) {
    next(err);
  }
});

const suggestionVoteRequest = z.object({
  voter_name: z.string().min(1).max(120),
  vote_type: z.enum(['up', 'down']).nullable()
});

// One vote per voter per suggestion (UNIQUE constraint on the table). Passing
// vote_type=null clears the voter's vote. After every change we re-run
// promoteWinningSuggestion so qa_entries reflects the new tallies. Submitters
// are blocked from voting on their own suggestions to keep self-promotion
// out of the score (a brand-new 0/0 suggestion already qualifies for
// promotion under the current rule when nothing else competes; letting the
// submitter upvote themselves would just be score inflation).
qaRouter.post('/suggestions/:id/vote', async (req, res, next) => {
  try {
    const suggestionId = Number(req.params.id);
    if (!suggestionId || Number.isNaN(suggestionId)) {
      return res.status(400).json({ error: 'invalid suggestion id' });
    }
    const parsed = suggestionVoteRequest.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const { voter_name, vote_type } = parsed.data;
    const pool = getPool();

    // Pull the question text up front so we can re-promote at the end and
    // so we can reject self-voting (submitters get an implicit +1 already;
    // letting them vote would double-count themselves).
    const [sRows] = await pool.query(
      'SELECT question, submitted_by FROM suggestions WHERE id = ? LIMIT 1',
      [suggestionId]
    );
    const suggestion = (sRows as Array<{ question: string; submitted_by: string }>)[0];
    if (!suggestion) {
      return res.status(404).json({ error: 'suggestion not found' });
    }
    if (suggestion.submitted_by.toLowerCase() === voter_name.toLowerCase()) {
      return res
        .status(400)
        .json({
          error:
            "You can't vote on your own suggestion. Submissions start at 0/0 and qualify for promotion on their own; let other users decide if it deserves more."
        });
    }

    if (vote_type === null) {
      await pool.query(
        'DELETE FROM suggestion_votes WHERE suggestion_id = ? AND voter_name = ?',
        [suggestionId, voter_name]
      );
    } else {
      await pool.query(
        `INSERT INTO suggestion_votes (suggestion_id, voter_name, vote_type)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE vote_type = VALUES(vote_type)`,
        [suggestionId, voter_name, vote_type]
      );
    }

    const promotion = await promoteWinningSuggestion(suggestion.question);
    res.json({
      vote_type,
      qa_entries_answer: promotion?.answer ?? null,
      promoted: promotion?.promoted ?? false
    });
  } catch (err) {
    next(err);
  }
});

const suggestionEditRequest = z.object({
  answer: z.string().min(1).max(8000),
  submitted_by: z.string().min(1).max(120)
});

// Edit the text of a suggestion. Only the original submitter is allowed —
// we compare `submitted_by` from the body against the stored row (case-
// insensitive via the table collation). Re-runs promotion after the edit
// because changing the answer text can shift which answer wins.
qaRouter.put('/suggestions/:id', async (req, res, next) => {
  try {
    const suggestionId = Number(req.params.id);
    if (!suggestionId || Number.isNaN(suggestionId)) {
      return res.status(400).json({ error: 'invalid suggestion id' });
    }
    const parsed = suggestionEditRequest.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const { answer, submitted_by } = parsed.data;
    const pool = getPool();

    const [sRows] = await pool.query(
      'SELECT question, submitted_by FROM suggestions WHERE id = ? LIMIT 1',
      [suggestionId]
    );
    const suggestion = (sRows as Array<{ question: string; submitted_by: string }>)[0];
    if (!suggestion) {
      return res.status(404).json({ error: 'suggestion not found' });
    }
    if (suggestion.submitted_by.toLowerCase() !== submitted_by.toLowerCase()) {
      return res.status(403).json({ error: 'Only the original submitter can edit this suggestion.' });
    }

    await pool.query(
      'UPDATE suggestions SET answer = ? WHERE id = ?',
      [answer, suggestionId]
    );
    // Wipe any votes that other users cast on the *previous* text — their
    // approval/rejection no longer represents informed consent now that the
    // answer has changed. The client UI shows a warning before the edit so
    // the submitter knows this will happen.
    const [delRes] = await pool.query(
      'DELETE FROM suggestion_votes WHERE suggestion_id = ?',
      [suggestionId]
    );
    const deletedVotes = (delRes as { affectedRows: number }).affectedRows ?? 0;

    const promotion = await promoteWinningSuggestion(suggestion.question);
    res.json({
      updated: true,
      deleted_votes: deletedVotes,
      qa_entries_answer: promotion?.answer ?? null,
      promoted: promotion?.promoted ?? false
    });
  } catch (err) {
    next(err);
  }
});

qaRouter.post('/suggest', async (req, res, next) => {
  try {
    const parsed = suggestRequest.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const { question, suggested_answer, submitted_by, target_message_id } = parsed.data;
    const pool = getPool();

    await pool.query(
      'INSERT INTO suggestions (question, answer, submitted_by) VALUES (?, ?, ?)',
      [question, suggested_answer, submitted_by]
    );

    const result = await promoteWinningSuggestion(question);

    // If a specific assistant message was clicked for Suggest, AND our
    // submission is now the qa_entries answer, rewrite that bubble's stored
    // content + Preferred flag. This makes the real-time update from the
    // chat UI survive a page reload. Limited to the targeted message so we
    // don't retroactively edit other historical bubbles for this question.
    let updatedTargetMessage = false;
    if (
      target_message_id &&
      result?.promoted &&
      result.answer === suggested_answer
    ) {
      const [updRes] = await pool.query(
        `UPDATE messages
            SET content = ?, from_qa_entries = 1
          WHERE id = ? AND role = 'assistant'`,
        [suggested_answer, target_message_id]
      );
      updatedTargetMessage = ((updRes as { affectedRows: number }).affectedRows ?? 0) > 0;
    }

    res.json({
      submitted: true,
      promoted: result?.promoted ?? false,
      current_answer: result?.answer ?? null,
      updated_target_message: updatedTargetMessage
    });
  } catch (err) {
    next(err);
  }
});
