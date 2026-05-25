import { getPool } from '../db.js';

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;

// All user_names that have ever sent a message, optionally excluding one.
// Used by depersonalisation (no exclusion, every name swept to placeholder)
// AND by rehydration's legacy compatibility pass (exclude the current viewer
// so we don't accidentally replace their own name in the text).
export async function fetchUserNames(opts: { exclude?: string } = {}): Promise<string[]> {
  const pool = getPool();
  if (opts.exclude) {
    const [rows] = await pool.query(
      'SELECT DISTINCT user_name FROM messages WHERE user_name <> ? LIMIT 500',
      [opts.exclude]
    );
    return (rows as Array<{ user_name: string }>).map(r => r.user_name);
  }
  const [rows] = await pool.query(
    'SELECT DISTINCT user_name FROM messages LIMIT 500'
  );
  return (rows as Array<{ user_name: string }>).map(r => r.user_name);
}

// Depersonalisation: replace baked-in user names with the `<name>` placeholder
// so the stored qa_entries.answer is portable across viewers. Called by
// promote.ts before INSERT/UPDATE on qa_entries.
//
// Conservative on false positives: only swaps whole-word, case-insensitive
// matches of names that actually exist in the messages table, and skips
// 1-char names to avoid trash matches.
export function depersonalizeAnswer(answer: string, knownUserNames: string[]): string {
  if (knownUserNames.length === 0) return answer;
  let result = answer;
  for (const name of knownUserNames) {
    if (!name || name.length < 2) continue;
    const re = new RegExp(`\\b${name.replace(REGEX_ESCAPE, '\\$&')}\\b`, 'gi');
    result = result.replace(re, '<name>');
  }
  return result;
}

// Rehydration: substitute placeholders with the current viewer's values, then
// run a legacy-compatibility sweep that swaps any baked-in user name from
// pre-placeholder qa_entries rows with the current viewer's name. Both
// passes are needed because (a) new rows use `<name>`, but (b) existing rows
// still have actual names baked in until they're re-promoted.
//
// `values` is a map of placeholder key -> substitution value. Today only
// `name` is wired up; future placeholders like `age`, `location` etc. just
// need a new entry in this map at call sites.
export function rehydrateAnswer(
  answer: string,
  values: Record<string, string>,
  legacyKnownNames: string[] = []
): string {
  let result = answer;
  // Pass 1: placeholders.
  for (const [key, val] of Object.entries(values)) {
    const re = new RegExp(`<${key.replace(REGEX_ESCAPE, '\\$&')}>`, 'g');
    result = result.replace(re, val);
  }
  // Pass 2: legacy known-name swap. Only meaningful when we have a current
  // user name to swap *to*.
  const currentUser = values.name;
  if (currentUser && legacyKnownNames.length > 0) {
    for (const name of legacyKnownNames) {
      if (!name || name.length < 2) continue;
      if (name.toLowerCase() === currentUser.toLowerCase()) continue;
      const re = new RegExp(`\\b${name.replace(REGEX_ESCAPE, '\\$&')}\\b`, 'gi');
      result = result.replace(re, currentUser);
    }
  }
  return result;
}
