import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type QAEntry } from '../api/client';

const PAGE_SIZE = 20;

export default function List() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const [searchInput, setSearchInput] = useState(search);
  const [entries, setEntries] = useState<QAEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .listQA({ page, pageSize: PAGE_SIZE, search: search || undefined })
      .then(data => {
        setEntries(data.data);
        setTotal(data.total);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [search, page]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (searchInput.trim()) next.set('search', searchInput.trim());
    setSearchParams(next);
  }

  function goToPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex-1 px-6 py-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-medium mb-6">Q&amp;A Database</h1>
        <form onSubmit={handleSearch} className="mb-6 flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search questions and answers..."
            className="flex-1 rounded-lg bg-chat-input border border-chat-border px-4 py-2 text-chat-text placeholder-chat-muted focus:outline-none focus:border-chat-muted"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearchParams(new URLSearchParams());
              }}
              className="px-4 py-2 bg-chat-panel border border-chat-border rounded-lg text-sm"
            >
              Clear
            </button>
          )}
        </form>

        {error && (
          <div className="mb-4 p-3 rounded-lg border border-red-700 bg-red-900/20 text-red-200 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-chat-muted">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-chat-muted">
            {search ? `No entries match "${search}".` : 'No entries yet. Ask a question on the chat page to start.'}
          </p>
        ) : (
          <>
            <p className="text-sm text-chat-muted mb-3">
              {total} {total === 1 ? 'entry' : 'entries'}
              {search ? ` matching "${search}"` : ''} · page {page} of {totalPages}
            </p>
            <div className="space-y-3">
              {entries.map(entry => (
                <article
                  key={entry.id}
                  className="bg-chat-panel border border-chat-border rounded-lg p-4"
                >
                  <p className="font-medium text-chat-text mb-2">{entry.question}</p>
                  <p className="text-chat-text/80 whitespace-pre-wrap">{entry.answer}</p>
                  <p className="text-xs text-chat-muted mt-2">
                    Updated {new Date(entry.updated_at).toLocaleString()}
                  </p>
                </article>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex gap-2 justify-center mt-6 flex-wrap">
                <button
                  onClick={() => goToPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded bg-chat-panel border border-chat-border text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={`px-3 py-1 rounded text-sm ${
                      p === page
                        ? 'bg-white text-black'
                        : 'bg-chat-panel border border-chat-border'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => goToPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 rounded bg-chat-panel border border-chat-border text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
