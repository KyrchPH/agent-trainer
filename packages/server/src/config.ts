import { getPool } from './db.js';

export type ProviderName = 'anthropic' | 'openai' | 'deepseek';

export interface AppConfig {
  system_prompt: string;
  agent_personality: string;
  company_info: string;
  llm_provider: ProviderName;
  llm_model_anthropic: string;
  llm_model_openai: string;
  llm_model_deepseek: string;
}

const defaults: AppConfig = {
  system_prompt:
    'You are a helpful AI assistant for livestreaming inquiries. Answer the user using the provided context. If the context does not contain enough information to answer confidently, say you do not know.',
  agent_personality:
    'Friendly, concise, and helpful. Sound like a knowledgeable teammate, not a corporate script. Light warmth, no over-eagerness or filler.',
  company_info: '',
  llm_provider: 'anthropic',
  llm_model_anthropic: 'claude-sonnet-4-6',
  llm_model_openai: 'gpt-4o-mini',
  llm_model_deepseek: 'deepseek-chat'
};

export async function getConfig(): Promise<AppConfig> {
  const [rows] = await getPool().query('SELECT config_key, config_value FROM app_config');
  const map: Record<string, string> = {};
  for (const row of rows as Array<{ config_key: string; config_value: string }>) {
    map[row.config_key] = row.config_value;
  }
  return {
    system_prompt: map.system_prompt ?? defaults.system_prompt,
    agent_personality: map.agent_personality ?? defaults.agent_personality,
    company_info: map.company_info ?? defaults.company_info,
    llm_provider: (map.llm_provider as ProviderName) ?? defaults.llm_provider,
    llm_model_anthropic: map.llm_model_anthropic ?? defaults.llm_model_anthropic,
    llm_model_openai: map.llm_model_openai ?? defaults.llm_model_openai,
    llm_model_deepseek: map.llm_model_deepseek ?? defaults.llm_model_deepseek
  };
}

export async function setConfig(updates: Record<string, string>): Promise<void> {
  const pool = getPool();
  for (const [key, value] of Object.entries(updates)) {
    await pool.query(
      'INSERT INTO app_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)',
      [key, value]
    );
  }
}
