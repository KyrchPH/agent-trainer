import { useState } from 'react';
import { useUserName } from '../lib/userName';

export default function NamePrompt() {
  const { setName } = useUserName();
  const [input, setInput] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setName(trimmed);
  }

  return (
    <div className="min-h-screen bg-chat-bg text-chat-text flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-medium text-center mb-2">Welcome</h1>
        <p className="text-chat-muted text-center mb-8">
          What should the agent call you?
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
            placeholder="Your name"
            maxLength={120}
            className="w-full rounded-2xl bg-chat-input border border-chat-border px-5 py-3 text-chat-text placeholder-chat-muted focus:outline-none focus:border-chat-muted"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="w-full rounded-2xl bg-white text-black py-3 font-medium disabled:opacity-30"
          >
            Continue
          </button>
        </form>
        <p className="text-xs text-chat-muted text-center mt-6">
          Saved only in your browser. You can change it later.
        </p>
      </div>
    </div>
  );
}
