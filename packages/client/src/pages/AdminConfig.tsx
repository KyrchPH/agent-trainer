import { useEffect, useState } from 'react';
import { api, type AppConfig } from '../api/client';

export default function AdminConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then(setConfig)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api.updateConfig(config);
      setConfig(next);
      setSavedAt(new Date());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    if (!config) return;
    setConfig({ ...config, [key]: value });
  }

  if (loading) {
    return (
      <div className="flex-1 px-6 py-6">
        <p className="text-chat-muted">Loading...</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex-1 px-6 py-6">
        <p className="text-red-300">Failed to load config: {error}</p>
      </div>
    );
  }

  return (
    <div className="thin-scrollbar flex-1 px-6 py-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-medium mb-6">Admin Configuration</h1>

        {error && (
          <div className="mb-4 p-3 rounded-lg border border-red-700 bg-red-900/20 text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <Field label="System Prompt" hint="Instructions sent to the AI on every chat request. Defines role, rules, and how to use context.">
            <textarea
              value={config.system_prompt}
              onChange={e => update('system_prompt', e.target.value)}
              rows={10}
              className="w-full rounded-lg bg-chat-input border border-chat-border px-4 py-2 text-chat-text font-mono text-sm focus:outline-none focus:border-chat-muted"
            />
          </Field>

          <Field label="Agent Personality" hint="How the AI should sound: tone, voice, mannerisms. Kept separate from the system prompt so you can iterate on it without touching the rules.">
            <textarea
              value={config.agent_personality}
              onChange={e => update('agent_personality', e.target.value)}
              rows={4}
              className="w-full rounded-lg bg-chat-input border border-chat-border px-4 py-2 text-chat-text font-mono text-sm focus:outline-none focus:border-chat-muted"
            />
          </Field>

          <Field label="Company Information" hint="Facts about the company: name, what you sell, hours, shipping policy, etc. The AI uses this as authoritative reference material.">
            <textarea
              value={config.company_info}
              onChange={e => update('company_info', e.target.value)}
              rows={8}
              className="w-full rounded-lg bg-chat-input border border-chat-border px-4 py-2 text-chat-text font-mono text-sm focus:outline-none focus:border-chat-muted"
            />
          </Field>

          <Field label="LLM Provider" hint="Which provider answers questions.">
            <select
              value={config.llm_provider}
              onChange={e => update('llm_provider', e.target.value as AppConfig['llm_provider'])}
              className="w-full rounded-lg bg-chat-input border border-chat-border px-4 py-2 text-chat-text focus:outline-none focus:border-chat-muted"
            >
              <option value="anthropic">Anthropic Claude</option>
              <option value="openai">OpenAI</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </Field>

          <Field label="Anthropic Model">
            <input
              type="text"
              value={config.llm_model_anthropic}
              onChange={e => update('llm_model_anthropic', e.target.value)}
              className="w-full rounded-lg bg-chat-input border border-chat-border px-4 py-2 text-chat-text focus:outline-none focus:border-chat-muted"
            />
          </Field>

          <Field label="OpenAI Model">
            <input
              type="text"
              value={config.llm_model_openai}
              onChange={e => update('llm_model_openai', e.target.value)}
              className="w-full rounded-lg bg-chat-input border border-chat-border px-4 py-2 text-chat-text focus:outline-none focus:border-chat-muted"
            />
          </Field>

          <Field label="DeepSeek Model" hint="deepseek-chat (V3) or deepseek-reasoner (R1).">
            <input
              type="text"
              value={config.llm_model_deepseek}
              onChange={e => update('llm_model_deepseek', e.target.value)}
              className="w-full rounded-lg bg-chat-input border border-chat-border px-4 py-2 text-chat-text focus:outline-none focus:border-chat-muted"
            />
          </Field>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-white text-black rounded-lg disabled:opacity-50 font-medium text-sm"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {savedAt && (
              <span className="text-sm text-chat-muted">
                Saved at {savedAt.toLocaleTimeString()}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {hint && <p className="text-xs text-chat-muted mb-2">{hint}</p>}
      {children}
    </div>
  );
}
