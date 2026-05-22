import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useUserName } from '../lib/userName';

type VoteState = 'up' | 'down' | null;

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  my_vote?: VoteState;
}

const TEXTAREA_MAX_HEIGHT = 200;
const MULTILINE_THRESHOLD = 40;

function BulbIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  );
}

function ThumbUpIcon({ className = 'w-4 h-4', filled = false }: { className?: string; filled?: boolean }) {
  if (filled) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M7.493 18.5c-.425 0-.82-.236-.975-.632A7.48 7.48 0 0 1 6 15.125c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75A.75.75 0 0 1 15 2a2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23h-.777ZM2.331 10.977a11.969 11.969 0 0 0-.831 4.398 12 12 0 0 0 .52 3.507c.26.85 1.084 1.368 1.973 1.368H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 0 1-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.227Z" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
    </svg>
  );
}

function ThumbDownIcon({ className = 'w-4 h-4', filled = false }: { className?: string; filled?: boolean }) {
  if (filled) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M15.73 5.5h1.035A7.465 7.465 0 0 1 18 9.625a7.465 7.465 0 0 1-1.235 4.125h-.148c-.806 0-1.534.446-2.031 1.08a9.04 9.04 0 0 1-2.861 2.4c-.723.384-1.35.956-1.653 1.715a4.498 4.498 0 0 0-.322 1.672v.633A.75.75 0 0 1 9 22a2.25 2.25 0 0 1-2.25-2.25c0-1.152.26-2.243.723-3.218.266-.558-.107-1.282-.725-1.282H3.622c-1.026 0-1.945-.694-2.054-1.715A12.137 12.137 0 0 1 1.5 12.25c0-2.848.992-5.464 2.649-7.521C4.537 4.247 5.136 4 5.754 4H9.77a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23ZM21.669 14.023c.536-1.362.831-2.845.831-4.398 0-1.22-.182-2.398-.52-3.507-.26-.85-1.084-1.368-1.973-1.368H19.1c-.445 0-.72.498-.523.898.591 1.2.924 2.55.924 3.977a8.959 8.959 0 0 1-1.302 4.666c-.245.403.028.959.5.959h1.053c.832 0 1.612-.453 1.918-1.227Z" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715a12.137 12.137 0 0 1-.068-1.285c0-2.848.992-5.464 2.649-7.521C5.287 4.247 5.886 4 6.504 4h4.016a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.75 2.25 2.25 0 0 0 9.75 22a.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384m-10.253 1.5H9.7m8.075-9.75c.01.05.027.1.05.148.593 1.2.925 2.55.925 3.977 0 1.487-.36 2.89-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.086 1.227-1.918 1.227h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 .303-.54" />
    </svg>
  );
}

export default function Chat() {
  const { name } = useUserName();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMultiLine, setIsMultiLine] = useState(false);
  const [replyToQuestion, setReplyToQuestion] = useState<string | null>(null);
  const [suggestStatus, setSuggestStatus] = useState<string | null>(null);
  // Tracks the most-recently clicked vote so we can scope the pop animation
  // to that single button without re-animating history-loaded votes on mount.
  const [animTrigger, setAnimTrigger] = useState<{ messageId: number; voteType: 'up' | 'down'; key: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const sh = ta.scrollHeight;
    if (input === '') {
      setIsMultiLine(false);
    } else if (sh > MULTILINE_THRESHOLD) {
      setIsMultiLine(true);
    }
    const needsScroll = sh > TEXTAREA_MAX_HEIGHT;
    ta.style.overflowY = needsScroll ? 'auto' : 'hidden';
    ta.style.height = `${Math.min(sh, TEXTAREA_MAX_HEIGHT)}px`;
  }, [input, isMultiLine]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    api
      .getMessages(name)
      .then(({ messages: stored }) => {
        if (cancelled) return;
        setMessages(
          stored.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            my_vote: m.my_vote
          }))
        );
      })
      .catch((err: Error) => {
        console.error('Failed to load chat history:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  function enterReplyMode(assistantIdx: number) {
    for (let i = assistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        setReplyToQuestion(messages[i].content);
        textareaRef.current?.focus();
        return;
      }
    }
  }

  async function handleVote(messageIdx: number, voteType: 'up' | 'down') {
    if (!name) return;
    const msg = messages[messageIdx];
    if (!msg.id) return;

    const previous = msg.my_vote ?? null;
    const next: VoteState = previous === voteType ? null : voteType;

    // Trigger the pop animation only when activating a vote (not when clearing).
    if (next !== null) {
      const key = Date.now();
      setAnimTrigger({ messageId: msg.id, voteType: next, key });
      window.setTimeout(() => {
        setAnimTrigger(curr => (curr?.key === key ? null : curr));
      }, 400);
    }

    // Optimistic update.
    setMessages(prev =>
      prev.map((m, i) => (i === messageIdx ? { ...m, my_vote: next } : m))
    );

    try {
      await api.voteOnMessage(msg.id, name, next);
    } catch (err) {
      // Revert on failure.
      setMessages(prev =>
        prev.map((m, i) => (i === messageIdx ? { ...m, my_vote: previous } : m))
      );
      console.error('Vote failed:', err);
    }
  }

  async function submit() {
    if (!input.trim() || loading || !name) return;

    if (replyToQuestion) {
      const suggested = input.trim();
      setInput('');
      setLoading(true);
      try {
        const result = await api.suggestAnswer(replyToQuestion, suggested, name);
        setReplyToQuestion(null);
        setSuggestStatus(
          result.promoted
            ? 'Your suggestion is now the saved answer.'
            : 'Suggestion submitted. The highest-voted suggestion wins.'
        );
        setTimeout(() => setSuggestStatus(null), 4000);
      } catch (err) {
        setSuggestStatus('Error: ' + (err as Error).message);
        setTimeout(() => setSuggestStatus(null), 6000);
      } finally {
        setLoading(false);
      }
      return;
    }

    const question = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setLoading(true);
    try {
      const res = await api.chat(question, name);
      const reply = res.answer ?? 'No response.';
      setMessages(prev => {
        // Patch the last user bubble with its id (from server) and append the assistant.
        const patched = [...prev];
        const lastUserIdx = patched.length - 1;
        if (
          lastUserIdx >= 0 &&
          patched[lastUserIdx].role === 'user' &&
          patched[lastUserIdx].id === undefined &&
          res.user_message_id !== undefined
        ) {
          patched[lastUserIdx] = { ...patched[lastUserIdx], id: res.user_message_id };
        }
        patched.push({
          id: res.assistant_message_id,
          role: 'assistant',
          content: reply,
          my_vote: null
        });
        return patched;
      });
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Error: ' + (err as Error).message }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <main ref={scrollRef} className="thin-scrollbar flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center mt-32">
              <p className="text-2xl text-chat-text">
                {name ? `Hi ${name}, what can I help with?` : 'What can I help with?'}
              </p>
              <p className="mt-3 text-sm text-chat-muted">
                Ask a question below to start the conversation.
              </p>
            </div>
          )}
          {messages.map((msg, idx) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id ?? `u-${idx}`} className="flex justify-end">
                  <div className="max-w-2xl px-4 py-3 rounded-2xl bg-chat-panel">
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              );
            }
            const upActive = msg.my_vote === 'up';
            const downActive = msg.my_vote === 'down';
            const canVote = msg.id !== undefined;
            const upPopKey =
              animTrigger !== null &&
              animTrigger.messageId === msg.id &&
              animTrigger.voteType === 'up'
                ? animTrigger.key
                : null;
            const downPopKey =
              animTrigger !== null &&
              animTrigger.messageId === msg.id &&
              animTrigger.voteType === 'down'
                ? animTrigger.key
                : null;
            return (
              <div key={msg.id ?? `a-${idx}`} className="flex flex-col items-start">
                <div className="max-w-2xl px-4 pt-3 pb-1">
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
                <div className="ml-4 inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => canVote && handleVote(idx, 'up')}
                    disabled={!canVote}
                    className={`p-1.5 rounded-md transition disabled:opacity-30 ${
                      upActive
                        ? 'text-green-400 bg-chat-panel'
                        : 'text-chat-text/80 hover:text-chat-text hover:bg-chat-panel'
                    }`}
                    title="Upvote"
                    aria-label="Upvote"
                    aria-pressed={upActive}
                  >
                    <ThumbUpIcon
                      key={upPopKey !== null ? `up-${msg.id}-${upPopKey}` : `up-${msg.id}-still`}
                      className={`w-4 h-4 ${upPopKey !== null ? 'animate-vote-pop' : ''}`}
                      filled={upActive}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => canVote && handleVote(idx, 'down')}
                    disabled={!canVote}
                    className={`p-1.5 rounded-md transition disabled:opacity-30 ${
                      downActive
                        ? 'text-red-400 bg-chat-panel'
                        : 'text-chat-text/80 hover:text-chat-text hover:bg-chat-panel'
                    }`}
                    title="Downvote"
                    aria-label="Downvote"
                    aria-pressed={downActive}
                  >
                    <ThumbDownIcon
                      key={downPopKey !== null ? `down-${msg.id}-${downPopKey}` : `down-${msg.id}-still`}
                      className={`w-4 h-4 ${downPopKey !== null ? 'animate-vote-pop' : ''}`}
                      filled={downActive}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => enterReplyMode(idx)}
                    className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] text-chat-muted hover:text-chat-text hover:bg-chat-panel transition"
                    title="Suggest a better answer"
                    aria-label="Suggest a better answer"
                  >
                    <BulbIcon className="w-3 h-3" />
                    <span>Suggest</span>
                  </button>
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 text-chat-muted">Thinking...</div>
            </div>
          )}
        </div>
      </main>
      <footer className="px-4 py-4">
        {suggestStatus && (
          <div className="max-w-[768px] mx-auto mb-2 px-4 py-2 rounded-2xl bg-chat-panel border border-chat-border text-xs text-chat-text text-center">
            {suggestStatus}
          </div>
        )}
        {replyToQuestion && (
          <div className="max-w-[768px] mx-auto mb-2 flex items-center gap-2 px-4 py-2 rounded-2xl bg-chat-panel border border-chat-border text-xs">
            <BulbIcon className="w-3.5 h-3.5 text-chat-muted shrink-0" />
            <span className="flex-1 truncate text-chat-muted">
              Suggesting answer for:{' '}
              <span className="text-chat-text">{replyToQuestion}</span>
            </span>
            <button
              type="button"
              onClick={() => setReplyToQuestion(null)}
              className="text-chat-muted hover:text-chat-text shrink-0 px-1"
              aria-label="Cancel suggestion"
            >
              ×
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="max-w-[768px] mx-auto">
          <div
            className={
              isMultiLine
                ? 'rounded-3xl bg-chat-input border border-chat-border p-2'
                : 'rounded-3xl bg-chat-input border border-chat-border flex items-end gap-2 p-2 pl-5'
            }
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={replyToQuestion ? 'Type your suggested answer...' : 'Ask anything'}
              rows={1}
              className={`thin-scrollbar bg-transparent border-0 resize-none py-1.5 text-chat-text placeholder-chat-muted focus:outline-none focus:ring-0 overflow-y-hidden leading-6 block ${
                isMultiLine ? 'w-full px-3' : 'flex-1'
              }`}
              style={{ maxHeight: TEXTAREA_MAX_HEIGHT }}
            />
            <div className={isMultiLine ? 'flex justify-end' : 'shrink-0'}>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-30"
                aria-label={replyToQuestion ? 'Submit suggestion' : 'Send'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-xs text-chat-muted text-center mt-3">
            Your inquiries and answers train the agent.
          </p>
        </form>
      </footer>
    </div>
  );
}
