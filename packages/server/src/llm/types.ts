export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMChatInput {
  system: string;
  messages: LLMMessage[];
  model: string;
}

export interface LLMProvider {
  name: 'anthropic' | 'openai';
  chat(input: LLMChatInput): Promise<string>;
}
