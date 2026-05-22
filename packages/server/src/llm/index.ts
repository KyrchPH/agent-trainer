import type { LLMProvider } from './types.js';
import type { ProviderName } from '../config.js';
import { createAnthropicProvider } from './anthropic.js';
import { createOpenAIProvider } from './openai.js';
import { createDeepSeekProvider } from './deepseek.js';

export function createProvider(name: ProviderName): LLMProvider {
  if (name === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    return createAnthropicProvider(key);
  }
  if (name === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is not set');
    return createOpenAIProvider(key);
  }
  if (name === 'deepseek') {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('DEEPSEEK_API_KEY is not set');
    return createDeepSeekProvider(key);
  }
  throw new Error(`Unknown provider: ${name as string}`);
}

export type { LLMProvider, LLMMessage, LLMChatInput } from './types.js';
