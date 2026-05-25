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
  suggestion_count?: number;
  from_qa_entries?: boolean;
  provider?: string;
  model?: string;
}

export interface StoredMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  my_vote: 'up' | 'down' | null;
  suggestion_count?: number;
  from_qa_entries?: boolean | number;
}

export interface SuggestResponse {
  submitted: boolean;
  promoted: boolean;
  current_answer: string | null;
  // True when the server rewrote the specific assistant message identified
  // by `target_message_id` because the submission became the canonical answer.
  // Lets the chat UI confirm the persistent update went through.
  updated_target_message?: boolean;
}

export interface SuggestionRow {
  id: number;
  answer: string;
  submitted_by: string;
  created_at: string;
  updated_at?: string;
  upvotes?: number;
  downvotes?: number;
  my_vote?: 'up' | 'down' | null;
}

export interface AppConfig {
  system_prompt: string;
  agent_personality: string;
  company_info: string;
  llm_provider: 'anthropic' | 'openai' | 'deepseek';
  llm_model_anthropic: string;
  llm_model_openai: string;
  llm_model_deepseek: string;
}

// Base URL the API is served from. In dev it stays empty so requests like
// "/api/chat" hit the Vite proxy (which forwards to localhost:4000). In a
// production build, set VITE_API_BASE in .env.production (or any .env that
// Vite loads for the active mode) to the public API origin, e.g.
//   VITE_API_BASE=https://api.wiseai.sixpent.com
// The trailing slash is stripped so we never end up with "//api/chat".
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + url, {
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

  getMessages: (params: { user_name: string; before_id?: number; limit?: number }) => {
    const qs = new URLSearchParams({ user_name: params.user_name });
    if (params.before_id !== undefined) qs.set('before_id', String(params.before_id));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return http<{ messages: StoredMessage[]; has_more: boolean }>(
      `/api/chat/messages?${qs.toString()}`
    );
  },

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

  suggestAnswer: (
    question: string,
    suggested_answer: string,
    submitted_by: string,
    target_message_id?: number | null
  ) =>
    http<SuggestResponse>('/api/qa/suggest', {
      method: 'POST',
      body: JSON.stringify({ question, suggested_answer, submitted_by, target_message_id })
    }),

  getSuggestions: (question: string, viewer?: string | null) => {
    const qs = new URLSearchParams({ question });
    if (viewer) qs.set('viewer', viewer);
    return http<{ suggestions: SuggestionRow[] }>(`/api/qa/suggestions?${qs.toString()}`);
  },

  voteOnSuggestion: (suggestionId: number, voterName: string, voteType: 'up' | 'down' | null) =>
    http<{
      vote_type: 'up' | 'down' | null;
      qa_entries_answer: string | null;
      promoted: boolean;
    }>(`/api/qa/suggestions/${suggestionId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ voter_name: voterName, vote_type: voteType })
    }),

  editSuggestion: (suggestionId: number, answer: string, submittedBy: string) =>
    http<{
      updated: boolean;
      deleted_votes: number;
      qa_entries_answer: string | null;
      promoted: boolean;
    }>(`/api/qa/suggestions/${suggestionId}`, {
      method: 'PUT',
      body: JSON.stringify({ answer, submitted_by: submittedBy })
    }),

  getConfig: () => http<AppConfig>('/api/admin/config'),

  updateConfig: (updates: Partial<AppConfig>) =>
    http<AppConfig>('/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),

  // Account / slash-command endpoints.
  clearMessages: (userName: string) =>
    http<{ deleted_messages: number }>(
      `/api/account/messages?user_name=${encodeURIComponent(userName)}`,
      { method: 'DELETE' }
    ),

  clearVotes: (voterName: string) =>
    http<{ deleted_votes: number }>(
      `/api/account/votes?voter_name=${encodeURIComponent(voterName)}`,
      { method: 'DELETE' }
    ),

  deleteAccount: (userName: string) =>
    http<{
      deleted_messages: number;
      deleted_votes: number;
      deleted_suggestions: number;
    }>(`/api/account?user_name=${encodeURIComponent(userName)}`, { method: 'DELETE' }),

  listUsers: () => http<{ users: string[] }>('/api/account/users'),

  // Returns the absolute URL of the qa_entries .xlsx export. Browsers respect
  // the `Content-Disposition: attachment` header on the response and trigger
  // a download, so we just need to hand the URL to an <a href> or
  // window.location. We can't use the http() helper here because it parses
  // the response as JSON.
  qaExportUrl: () => `${API_BASE}/api/qa/export`
};
