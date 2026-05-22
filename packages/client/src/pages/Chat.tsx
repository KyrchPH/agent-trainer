import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useUserName } from '../lib/userName';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Chat() {
  const { name } = useUserName();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setLoading(true);
    try {
      const res = await api.chat(question, name);
      const reply = res.answer ?? 'No response.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Error: ' + (err as Error).message }
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <main ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center text-chat-muted mt-32">
              <p className="text-2xl text-chat-text">
                {name ? `Hi ${name}, what can I help with?` : 'What can I help with?'}
              </p>
              <p className="mt-3 text-sm">Ask a livestreaming question. Your inquiries train the agent.</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-2xl px-4 py-3 rounded-2xl ${
                  msg.role === 'user' ? 'bg-chat-panel' : 'bg-transparent'
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 text-chat-muted">Thinking...</div>
            </div>
          )}
        </div>
      </main>
      <footer className="border-t border-chat-border px-4 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything"
              disabled={loading}
              className="w-full rounded-3xl bg-chat-input border border-chat-border px-5 py-3 pr-12 text-chat-text placeholder-chat-muted focus:outline-none focus:border-chat-muted"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-30"
              aria-label="Send"
            >
              ↑
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
