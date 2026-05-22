import type { LLMProvider } from './types.js';
import { createOpenAIProvider } from './openai.js';

// DeepSeek exposes an OpenAI-compatible Chat Completions API at
// https://api.deepseek.com, so we reuse the OpenAI SDK with a custom baseURL.
// Models: `deepseek-chat` (V3, general-purpose) and `deepseek-reasoner` (R1).
export function createDeepSeekProvider(apiKey: string): LLMProvider {
  return createOpenAIProvider(apiKey, {
    baseURL: 'https://api.deepseek.com',
    name: 'deepseek'
  });
}
