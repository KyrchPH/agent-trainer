import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from './types.js';

export function createAnthropicProvider(apiKey: string): LLMProvider {
  const client = new Anthropic({ apiKey });
  return {
    name: 'anthropic',
    async chat({ system, messages, model }) {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      });
      const block = response.content[0];
      if (block && block.type === 'text') return block.text;
      return '';
    }
  };
}
