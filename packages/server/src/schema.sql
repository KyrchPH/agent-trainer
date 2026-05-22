-- Run against an existing database, e.g.:
--   mysql -u root -p agent_trainer < schema.sql

CREATE TABLE IF NOT EXISTS qa_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FULLTEXT KEY ft_question (question),
  FULLTEXT KEY ft_qa (question, answer)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_config (
  config_key VARCHAR(64) PRIMARY KEY,
  config_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-user chat history. The utf8mb4_unicode_ci collation makes user_name
-- comparisons case- and accent-insensitive, so 'archie' and 'Archie' match.
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_name VARCHAR(120) NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_created (user_name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catalogue of products the agent can talk about. `category` groups SKUs
-- under the parent label from the source spreadsheet (the rows whose price
-- is a range like "265-415"); the SKUs underneath inherit that category.
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(255) NULL,
  price DECIMAL(10, 2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_name (name),
  KEY idx_category (category),
  FULLTEXT KEY ft_product (name, description, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One up/down vote per user per AI message. UNIQUE(message_id, voter_name)
-- enforces the "1 vote per person per chat bubble" rule. Updating the row
-- changes the vote; deleting clears it.
CREATE TABLE IF NOT EXISTS message_votes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  voter_name VARCHAR(120) NOT NULL,
  vote_type ENUM('up', 'down') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_msg_voter (message_id, voter_name),
  KEY idx_message (message_id),
  CONSTRAINT fk_msg_votes_msg FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Raw user-submitted suggestions. The qa_entries row for a question is
-- recomputed after every insert: group by answer text (case-insensitive via
-- collation), pick the group with the most distinct submitters, tiebreak by
-- most recent.
CREATE TABLE IF NOT EXISTS suggestions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  submitted_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_question (question(255)),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_config (config_key, config_value) VALUES
  ('system_prompt', 'You are WiseAI, a helpful assistant for livestreaming questions. You are the company''s Livestreamer AI Agent.\n\n## Language\n\nMatch the user''s language exactly:\n- English: reply in English.\n- Tagalog (Filipino): reply in natural conversational Tagalog.\n- Taglish (mixed English + Tagalog): mirror their mix, in the same proportions.\n\nMatch their formality. Use "po" / "opo" only if they do.\n\n## Sources of truth (use in this order)\n\nThe server may attach context to this prompt under labelled sections:\n\n1. **Previously trained Q&A** — the company''s full library of answers from prior conversations, ordered most-recently-updated first. Skim it for entries whose meaning matches the user''s question (not just the exact words; semantic match counts). When one fits, base your reply on it. Treat these as the company''s authoritative source.\n2. **Relevant products** — products whose name, description, or category matched the user''s keywords, ordered by relevance. Use this section ONLY when the user is asking about a product (price, availability, kit contents, scent or size options, etc). Do not volunteer products when the question is not about them.\n3. **Conversation history** — earlier turns in this chat. Use them to track context and what you have already said, but treat the Q&A section above as more authoritative if they conflict.\n\nIf none of the above contains the answer, say you do not know. Never fabricate company-specific facts (prices, schedules, policies, procedures, names).\n\n## Style\n\n- Be concise. One or two sentences when possible.\n- Plain, direct language. No filler like "Certainly!", "Great question!", or "Of course!".\n- Use the user''s name occasionally when it feels natural, not in every reply.\n- Use Markdown only for lists or code, never for emphasis.\n\n## When you do not know\n\nSay so plainly. Examples:\n- English: "I don''t have that information yet. Could you give me more details, or check with a teammate?"\n- Tagalog: "Wala pa akong impormasyon tungkol diyan. Pwede mo bang i-share ang mas detalyadong tanong, o baka may kasamahan na alam?"\n- Taglish: "Wala pa akong info tungkol diyan, could you share more details or check with a teammate?"\n\nNever fabricate an answer to fill the silence.'),
  ('llm_provider', 'anthropic'),
  ('llm_model_anthropic', 'claude-sonnet-4-6'),
  ('llm_model_openai', 'gpt-4o-mini'),
  ('llm_model_deepseek', 'deepseek-chat')
ON DUPLICATE KEY UPDATE config_value = config_value;
