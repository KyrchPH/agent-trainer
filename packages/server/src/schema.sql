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

INSERT INTO app_config (config_key, config_value) VALUES
  ('system_prompt', 'You are a helpful AI assistant for livestreaming inquiries. Answer the user using the provided context. If the context does not contain enough information to answer confidently, say you do not know.'),
  ('llm_provider', 'anthropic'),
  ('llm_model_anthropic', 'claude-sonnet-4-6'),
  ('llm_model_openai', 'gpt-4o-mini')
ON DUPLICATE KEY UPDATE config_value = config_value;
