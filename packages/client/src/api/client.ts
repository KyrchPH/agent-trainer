export interface QAEntry {
  id: number;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
}

export interface ChatResponse {
  answer: string | null;
  qa_context?: Array<{ id: number; question: string; answer: string }>;
  product_context?: Array<{
    id: number;
    name: string;
    category: string | null;
    price: number;
    description: string | null;
  }>;
  user_name?: string | null;
  user_message_id?: number;
  assistant_message_id?: number;
  provider?: string;
  model?: string;
}

export interface StoredMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  my_vote: 'up' | 'down' | null;
}

export interface SuggestResponse {
  submitted: boolean;
  promoted: boolean;
  current_answer: string | null;
}

export interface AppConfig {
  system_prompt: string;
  llm_provider: 'anthropic' | 'openai' | 'deepseek';
  llm_model_anthropic: string;
  llm_model_openai: string;
  llm_model_deepseek: string;
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return (await res.json()) as T;
}

export const api = {
  chat: (question: string, userName?: string | null) =>
    http<ChatResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ question, user_name: userName ?? undefined })
    }),

  getMessages: (userName: string) =>
    http<{ messages: StoredMessage[] }>(
      `/api/chat/messages?user_name=${encodeURIComponent(userName)}`
    ),

  voteOnMessage: (messageId: number, voterName: string, voteType: 'up' | 'down' | null) =>
    http<{ vote_type: 'up' | 'down' | null }>(
      `/api/chat/messages/${messageId}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({ voter_name: voterName, vote_type: voteType })
      }
    ),

  listQA: (params: { page?: number; pageSize?: number; search?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.search) qs.set('search', params.search);
    return http<{ data: QAEntry[]; page: number; pageSize: number; total: number }>(
      `/api/qa?${qs.toString()}`
    );
  },

  suggestAnswer: (question: string, suggested_answer: string, submitted_by: string) =>
    http<SuggestResponse>('/api/qa/suggest', {
      method: 'POST',
      body: JSON.stringify({ question, suggested_answer, submitted_by })
    }),

  getConfig: () => http<AppConfig>('/api/admin/config'),

  updateConfig: (updates: Partial<AppConfig>) =>
    http<AppConfig>('/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify(updates)
    })
};
