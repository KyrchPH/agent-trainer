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
  name: 'anthropic' | 'openai' | 'deepseek';
  chat(input: LLMChatInput): Promise<string>;
}
