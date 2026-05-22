export interface QAEntry {
  id: number;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
}

export interface ChatResponse {
  answer: string | null;
  context: Array<{ id: number; question: string; answer: string }>;
  user_name?: string | null;
}

export interface AppConfig {
  system_prompt: string;
  llm_provider: 'anthropic' | 'openai';
  llm_model_anthropic: string;
  llm_model_openai: string;
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

  listQA: (params: { page?: number; pageSize?: number; search?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.search) qs.set('search', params.search);
    return http<{ data: QAEntry[]; page: number; pageSize: number; total: number }>(
      `/api/qa?${qs.toString()}`
    );
  },

  suggestAnswer: (question: string, suggested_answer: string) =>
    http<unknown>('/api/qa/suggest', {
      method: 'POST',
      body: JSON.stringify({ question, suggested_answer })
    }),

  getConfig: () => http<AppConfig>('/api/admin/config'),

  updateConfig: (updates: Partial<AppConfig>) =>
    http<AppConfig>('/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify(updates)
    })
};
