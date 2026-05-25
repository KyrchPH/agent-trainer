import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db.js';
import { getConfig } from '../config.js';
import { createProvider, type LLMMessage } from '../llm/index.js';
import {
  getQuestionForAssistantMessage,
  promoteWinningSuggestion
} from '../lib/promote.js';
import {
  fetchUserNames,
  rehydrateAnswer
} from '../lib/personalize.js';

export const chatRouter = Router();

// Cap on conversation turns fed back to the LLM when generating a reply.
// Each turn is one row (user message or assistant reply). 20 rows ~= 10
// exchanges of context. This is purely about prompt size — the client's
// history view is NOT subject to this limit.
const LLM_CONTEXT_LIMIT = 20;

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
    `The user you are speaking with is named "${opts.userName}". ` +
    `When addressing them, you may use any of these forms: ` +
    `(a) their actual name alone ("${opts.userName}"), ` +
    `(b) the generic community term alone ("Ka-wise" — the address for WiseAI users, in the spirit of "kabayan"), ` +
    `(c) the combined form ("Ka-wise ${opts.userName}"), ` +
    `(d) a playful Filipino prefix with Ka-wise ("poging Ka-wise", "gandang Ka-wise", "Ka-wise ko", "Mahal kong Ka-wise"), ` +
    `(e) any combination of the above (e.g. "poging Ka-wise ${opts.userName}", "gandang Ka-wise ${opts.userName}"). ` +
    `NEVER invent, guess, abbreviate, shorten, or substitute any other name for them. ` +
    `If their actual name is "${opts.userName}", the only "name" word that may appear in your reply is "${opts.userName}" itself — no nicknames, no shortened forms, no made-up alternatives. ` +
    `When their gender is unclear, default to "Ka-wise" or "Ka-wise ${opts.userName}" (both gender-neutral). ` +
    `Inventing or fabricating a name is a serious error.`
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
    [userName, LLM_CONTEXT_LIMIT]
  );
  return (rows as Array<{ role: 'user' | 'assistant'; content: string }>)
    .map(r => ({ role: r.role, content: r.content }))
    .reverse();
}

// Personalisation helpers live in lib/personalize.ts. `qa_entries.answer` is
// stored with `<name>` placeholders going forward (depersonalised in
// promote.ts before write); we rehydrate to the current viewer's name at
// serve time. The rehydrate pass also runs a legacy-compatibility sweep
// that swaps any baked-in old user name from pre-placeholder rows.

chatRouter.get('/messages', async (req, res, next) => {
  try {
    const userName = String(req.query.user_name ?? '').trim();
    if (!userName) {
      return res.status(400).json({ error: 'user_name query param is required' });
    }
    // Cursor-based pagination so the client can lazy-load older messages on
    // scroll-up. `before_id` is the id of the oldest message already in the
    // client's window — server returns rows with id < before_id. Omitted
    // before_id means "the latest page". `limit` defaults to 30; we fetch
    // limit+1 so we can tell the client whether more older history exists
    // without a separate COUNT query.
    const beforeIdRaw = req.query.before_id;
    const beforeId =
      beforeIdRaw === undefined || beforeIdRaw === '' || beforeIdRaw === null
        ? null
        : Number(beforeIdRaw);
    if (beforeId !== null && (!Number.isFinite(beforeId) || beforeId < 1)) {
      return res.status(400).json({ error: 'before_id must be a positive integer' });
    }
    const limitRaw = Number(req.query.limit ?? 30);
    const limit = Math.min(
      100,
      Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 30)
    );
    const fetchLimit = limit + 1;

    const pool = getPool();

    // suggestion_count: for each assistant message, the number of rows in
    // `suggestions` whose `question` matches the immediately-preceding user
    // message. Computed in one pass via the `suggestion_counts` aggregate
    // CTE joined to `paired` (which uses LAG over the full per-user history
    // so prev_content/prev_role stay accurate even when we only return a
    // page of recent rows). The client uses this to hide "See other
    // suggestions" when there are zero or one suggestions for the question.
    //
    // from_qa_entries is a persisted column on `messages` (set to 1 at
    // INSERT time when POST /api/chat short-circuits via a qa_entries hit).
    //
    // ORDER BY DESC + LIMIT picks the latest page. We slice off the
    // limit+1 sentinel server-side and reverse to chronological ASC so the
    // client can naturally prepend / append.
    const beforeFilter = beforeId !== null ? 'WHERE p.id < ?' : '';
    const params: Array<string | number> = [userName, userName];
    if (beforeId !== null) params.push(beforeId);
    params.push(fetchLimit);

    const [rows] = await pool.query(
      `WITH paired AS (
         SELECT m.id, m.role, m.content, m.created_at, m.from_qa_entries,
                LAG(m.content) OVER (PARTITION BY m.user_name ORDER BY m.created_at, m.id) AS prev_content,
                LAG(m.role)    OVER (PARTITION BY m.user_name ORDER BY m.created_at, m.id) AS prev_role
         FROM messages m
         WHERE m.user_name = ?
       ),
       suggestion_counts AS (
         SELECT question, COUNT(*) AS cnt FROM suggestions GROUP BY question
       )
       SELECT p.id, p.role, p.content, p.created_at,
              mv.vote_type AS my_vote,
              COALESCE(sc.cnt, 0) AS suggestion_count,
              p.from_qa_entries
       FROM paired p
       LEFT JOIN message_votes mv
         ON mv.message_id = p.id AND mv.voter_name = ?
       LEFT JOIN suggestion_counts sc
         ON p.role = 'assistant' AND p.prev_role = 'user' AND sc.question = p.prev_content
       ${beforeFilter}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ?`,
      params
    );

    const fetched = rows as Array<unknown>;
    const hasMore = fetched.length > limit;
    const trimmed = hasMore ? fetched.slice(0, limit) : fetched;
    // Reverse to chronological order so the client can append/prepend
    // without sorting.
    const messages = trimmed.reverse();
    res.json({ messages, has_more: hasMore });
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

    // Short-circuit: if this exact question already has a trained answer in
    // qa_entries, return it verbatim and skip the LLM call. This is the
    // whole point of the training-data loop — once an answer is the
    // community-promoted winner, the agent should give it back deterministically
    // (rather than re-generating a paraphrase each turn). The client renders
    // a yellow "Preferred" badge on these bubbles. Question comparison is
    // case-insensitive via the table's utf8mb4_unicode_ci collation.
    const [qaMatchRows] = await pool.query(
      'SELECT answer FROM qa_entries WHERE question = ? LIMIT 1',
      [question]
    );
    const qaMatch = (qaMatchRows as Array<{ answer: string }>)[0];

    const config = await getConfig();
    const model =
      config.llm_provider === 'anthropic'
        ? config.llm_model_anthropic
        : config.llm_provider === 'deepseek'
          ? config.llm_model_deepseek
          : config.llm_model_openai;

    let answer: string;
    let fromQaEntries: boolean;
    let qaContext: QAContextRow[] = [];
    let productContext: ProductContextRow[] = [];

    if (qaMatch) {
      // Substitute `<name>` placeholders with the current viewer's name (and
      // sweep any legacy baked-in names from pre-placeholder rows). Stored
      // qa_entries answers are now placeholder-form by default; this call
      // turns them into the final personalised text the customer sees.
      const legacyNames = await fetchUserNames({ exclude: user_name });
      answer = rehydrateAnswer(qaMatch.answer, { name: user_name }, legacyNames);
      fromQaEntries = true;
    } else {
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
      qaContext = qaRows as QAContextRow[];

      // Rehydrate every Q&A answer before injection: substitute `<name>`
      // placeholders with the current viewer's name (and sweep any legacy
      // baked-in names from pre-placeholder rows). Without this pass, a
      // trained answer that still contains a baked-in name like "Yam, sa..."
      // would feed into the context and the LLM would copy that name into
      // its reply. One DB lookup for the name set, then N pure string
      // substitutions.
      const legacyNames = await fetchUserNames({ exclude: user_name });
      qaContext = qaContext.map(c => ({
        ...c,
        answer: rehydrateAnswer(c.answer, { name: user_name }, legacyNames)
      }));

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
      productContext = (
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
      answer = await provider.chat({ system, model, messages: history });
      fromQaEntries = false;
    }

    const [aiInsert] = await pool.query(
      'INSERT INTO messages (user_name, role, content, from_qa_entries) VALUES (?, ?, ?, ?)',
      [user_name, 'assistant', answer, fromQaEntries ? 1 : 0]
    );
    const assistantMessageId = (aiInsert as { insertId: number }).insertId;

    // Pre-compute how many user-submitted suggestions already exist for this
    // exact question text, so the client can decide whether to render the
    // "See other suggestions" affordance on the freshly-arrived AI bubble
    // without an extra round trip.
    const [suggCountRows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM suggestions WHERE question = ?',
      [question]
    );
    const suggestionCount = Number(
      (suggCountRows as Array<{ cnt: number }>)[0]?.cnt ?? 0
    );

    res.json({
      answer,
      qa_context: qaContext,
      product_context: productContext,
      user_name,
      user_message_id: userMessageId,
      assistant_message_id: assistantMessageId,
      suggestion_count: suggestionCount,
      from_qa_entries: fromQaEntries,
      provider: config.llm_provider,
      model
    });
  } catch (err) {
    next(err);
  }
});
