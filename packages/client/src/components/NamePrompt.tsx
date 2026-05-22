import { useState } from 'react';
import { useUserName } from '../lib/userName';
import AuroraBackground from './AuroraBackground';

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
    <div className="relative min-h-screen overflow-hidden">
      <AuroraBackground />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md flex flex-col items-center">
          <img
            src="/logo.svg"
            alt="WiseAI logo"
            className="w-20 h-20 mb-4"
          />
          <h1 className="text-5xl font-bold text-center text-white mb-8 tracking-tight">
            WiseAI
          </h1>
          <div className="w-full bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            <p className="text-white/70 text-center mb-8">
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
                className="w-full rounded-2xl bg-white/5 border border-white/10 px-5 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus:bg-white/10 transition"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="w-full rounded-2xl bg-white text-black py-3 font-medium disabled:opacity-30 transition"
              >
                Continue
              </button>
            </form>
            <p className="text-xs text-white/40 text-center mt-6">
              Saved only in your browser. You can change it later.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
