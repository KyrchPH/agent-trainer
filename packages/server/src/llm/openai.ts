import OpenAI from 'openai';
import type { LLMProvider } from './types.js';

export function createOpenAIProvider(apiKey: string): LLMProvider {
  const client = new OpenAI({ apiKey });
  return {
    name: 'openai',
    async chat({ system, messages, model }) {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          ...messages.map(m => ({ role: m.role, content: m.content }))
        ]
      });
      return response.choices[0]?.message?.content ?? '';
    }
  };
}
