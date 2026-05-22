import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db.js';
import { getConfig } from '../config.js';
import { createProvider, type LLMMessage } from '../llm/index.js';
import {
  getQuestionForAssistantMessage,
  promoteWinningSuggestion
} from '../lib/promote.js';

export const chatRouter = Router();

// Cap on conversation turns fed back to the LLM. Each turn is one row
// (user message or assistant reply). 20 rows ~= 10 exchanges of context.
const HISTORY_LIMIT = 20;

const chatRequest = z.object({
  question: z.string().min(1).max(4000),
  user_name: z.string().min(1).max(120)
});

const voteRequest = z.object({
  voter_name: z.string().min(1).max(120),
  vote_type: z.enum(['up', 'down']).nullable()
});

type QAContextRow = { id: number; question: string; answer: string };
type ProductContextRow = {
  id: number;
  name: string;
  category: string | null;
  price: number;
  description: string | null;
};
type CategorySummary = {
  category: string | null;
  sku_count: number;
  min_price: number;
  max_price: number;
};
type ProductSummary = {
  totalProducts: number;
  categories: CategorySummary[];
};

function buildSystemPrompt(opts: {
  basePrompt: string;
  personality: string;
  companyInfo: string;
  userName: string;
  qaContext: QAContextRow[];
  productContext: ProductContextRow[];
  productSummary: ProductSummary;
}): string {
  const parts: string[] = [opts.basePrompt];

  // Personality controls *how* the assistant talks. Stable across turns.
  if (opts.personality.trim()) {
    parts.push(`## Personality\n\n${opts.personality.trim()}`);
  }

  // Company information is reference material about the business itself.
  // Combined with Q&A as authoritative factual context.
  if (opts.companyInfo.trim()) {
    parts.push(`## Company information\n\n${opts.companyInfo.trim()}`);
  }

  parts.push(
    `The user you are speaking with is named ${opts.userName}. Address them by name when it feels natural.`
  );

  // Q&A section — primary source of truth.
  if (opts.qaContext.length > 0) {
    parts.push(
      `## Previously trained Q&A\n\n` +
        opts.qaContext
          .map(
            (c, i) =>
              `(${i + 1}) Q: ${c.question}\n    A: ${c.answer}`
          )
          .join('\n\n')
    );
  } else {
    parts.push('## Previously trained Q&A\n\n(No related entries found for this question.)');
  }

  // Product catalog summary — included on every turn so the AI can answer
  // aggregate questions ("how many products?", "what categories?") without
  // depending on FULLTEXT keyword matching.
  if (opts.productSummary.totalProducts > 0) {
    const catCount = opts.productSummary.categories.length;
    const catLines = opts.productSummary.categories.map(c => {
      const range =
        c.min_price === c.max_price
          ? `₱${c.min_price.toFixed(2)}`
          : `₱${c.min_price.toFixed(2)} - ₱${c.max_price.toFixed(2)}`;
      return `- ${c.category ?? '(uncategorised)'}: ${c.sku_count} SKU${c.sku_count === 1 ? '' : 's'}, ${range}`;
    });
    parts.push(
      `## Product catalog summary\n\n` +
        `Total: ${opts.productSummary.totalProducts} products across ${catCount} categor${catCount === 1 ? 'y' : 'ies'}.\n\n` +
        `By category (SKU count, price range):\n${catLines.join('\n')}`
    );
  }

  // Specific matched products — only when keyword/category search hit.
  if (opts.productContext.length > 0) {
    parts.push(
      `## Relevant products\n\n` +
        opts.productContext
          .map(p => {
            const cat = p.category ? ` [${p.category}]` : '';
            const desc = p.description ? ` — ${p.description}` : '';
            const price = Number.isFinite(p.price) ? p.price.toFixed(2) : String(p.price);
            return `- ${p.name}${cat}: ₱${price}${desc}`;
          })
          .join('\n')
    );
  }

  return parts.join('\n\n');
}

async function fetchRecentMessages(userName: string): Promise<LLMMessage[]> {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT role, content FROM messages WHERE user_name = ? ORDER BY created_at DESC, id DESC LIMIT ?',
    [userName, HISTORY_LIMIT]
  );
  return (rows as Array<{ role: 'user' | 'assistant'; content: string }>)
    .map(r => ({ role: r.role, content: r.content }))
    .reverse();
}

chatRouter.get('/messages', async (req, res, next) => {
  try {
    const userName = String(req.query.user_name ?? '').trim();
    if (!userName) {
      return res.status(400).json({ error: 'user_name query param is required' });
    }
    const pool = getPool();
    // LEFT JOIN message_votes filtered to the current user, so each row carries
    // the viewer's own vote (or NULL if they haven't voted).
    const [rows] = await pool.query(
      `SELECT m.id, m.role, m.content, m.created_at, mv.vote_type AS my_vote
       FROM messages m
       LEFT JOIN message_votes mv
         ON mv.message_id = m.id AND mv.voter_name = ?
       WHERE m.user_name = ?
       ORDER BY m.created_at ASC, m.id ASC
       LIMIT ?`,
      [userName, userName, HISTORY_LIMIT]
    );
    res.json({ messages: rows });
  } catch (err) {
    next(err);
  }
});

chatRouter.post('/messages/:id/vote', async (req, res, next) => {
  try {
    const messageId = Number(req.params.id);
    if (!messageId || Number.isNaN(messageId)) {
      return res.status(400).json({ error: 'invalid message id' });
    }
    const parsed = voteRequest.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const { voter_name, vote_type } = parsed.data;
    const pool = getPool();

    if (vote_type === null) {
      await pool.query(
        'DELETE FROM message_votes WHERE message_id = ? AND voter_name = ?',
        [messageId, voter_name]
      );
    } else {
      await pool.query(
        `INSERT INTO message_votes (message_id, voter_name, vote_type)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE vote_type = VALUES(vote_type)`,
        [messageId, voter_name, vote_type]
      );
    }

    // The vote may have changed the winning answer for this question;
    // re-run promotion so qa_entries reflects the latest scores.
    const question = await getQuestionForAssistantMessage(messageId);
    const promotion = question ? await promoteWinningSuggestion(question) : null;

    res.json({
      vote_type,
      qa_entries_answer: promotion?.answer ?? null,
      promoted: promotion?.promoted ?? false
    });
  } catch (err) {
    next(err);
  }
});

chatRouter.post('/', async (req, res, next) => {
  try {
    const parsed = chatRequest.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const { question, user_name } = parsed.data;
    const pool = getPool();

    const [userInsert] = await pool.query(
      'INSERT INTO messages (user_name, role, content) VALUES (?, ?, ?)',
      [user_name, 'user', question]
    );
    const userMessageId = (userInsert as { insertId: number }).insertId;

    const history = await fetchRecentMessages(user_name);

    // Every Q&A entry. Keyword matching on Q&A is too fragile — users phrase
    // the same question many ways, so we feed the LLM the full library and
    // let it judge which entry applies. Sorted by most recently updated so
    // the freshest knowledge appears first.
    const [qaRows] = await pool.query(
      `SELECT id, question, answer
       FROM qa_entries
       ORDER BY updated_at DESC, id DESC`
    );
    const qaContext = qaRows as QAContextRow[];

    // All products that match the user's keywords against (name, description,
    // category). No LIMIT: when the question is genuinely about a product
    // group, every matching SKU goes in so the LLM can compare. When the
    // question isn't product-related, the WHERE returns zero rows and the
    // products section is omitted from the prompt entirely.
    const [productRows] = await pool.query(
      `SELECT id, name, category, price, description
       FROM products
       WHERE MATCH(name, description, category) AGAINST(? IN NATURAL LANGUAGE MODE)
       ORDER BY MATCH(name, description, category) AGAINST(? IN NATURAL LANGUAGE MODE) DESC`,
      [question, question]
    );
    const productContext = (
      productRows as Array<{
        id: number;
        name: string;
        category: string | null;
        price: string | number;
        description: string | null;
      }>
    ).map(p => ({ ...p, price: Number(p.price) }));

    // Catalog summary: total + per-category count and price range.
    const [totalRows] = await pool.query('SELECT COUNT(*) AS n FROM products');
    const totalProducts = Number((totalRows as Array<{ n: number }>)[0]?.n ?? 0);
    const [summaryRows] = await pool.query(
      `SELECT category, COUNT(*) AS sku_count, MIN(price) AS min_price, MAX(price) AS max_price
       FROM products
       GROUP BY category
       ORDER BY sku_count DESC, category ASC`
    );
    const categories: CategorySummary[] = (
      summaryRows as Array<{ category: string | null; sku_count: number; min_price: string | number; max_price: string | number }>
    ).map(r => ({
      category: r.category,
      sku_count: Number(r.sku_count),
      min_price: Number(r.min_price),
      max_price: Number(r.max_price)
    }));
    const productSummary: ProductSummary = { totalProducts, categories };

    const config = await getConfig();
    const model =
      config.llm_provider === 'anthropic'
        ? config.llm_model_anthropic
        : config.llm_provider === 'deepseek'
          ? config.llm_model_deepseek
          : config.llm_model_openai;

    const system = buildSystemPrompt({
      basePrompt: config.system_prompt,
      personality: config.agent_personality,
      companyInfo: config.company_info,
      userName: user_name,
      qaContext,
      productContext,
      productSummary
    });

    const provider = createProvider(config.llm_provider);
    const answer = await provider.chat({ system, model, messages: history });

    const [aiInsert] = await pool.query(
      'INSERT INTO messages (user_name, role, content) VALUES (?, ?, ?)',
      [user_name, 'assistant', answer]
    );
    const assistantMessageId = (aiInsert as { insertId: number }).insertId;

    res.json({
      answer,
      qa_context: qaContext,
      product_context: productContext,
      user_name,
      user_message_id: userMessageId,
      assistant_message_id: assistantMessageId,
      provider: config.llm_provider,
      model
    });
  } catch (err) {
    next(err);
  }
});
