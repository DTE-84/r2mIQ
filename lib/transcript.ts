/**
 * Transcript merging for live dictation.
 *
 * Speech engines do not agree on what a "final" result contains:
 *  - Android 13+ (native) sends each finished segment once.
 *  - Chrome on Android (web, continuous mode) re-sends the whole sentence so far
 *    as a new "final" every time ("hello" -> "hello world" -> "hello world how").
 *  - iOS 18 emits "final-like" results after each pause and then a true final on
 *    stop that can repeat the last segment, or the entire session.
 *
 * Appending every final result blindly therefore doubles text. `mergeFinal`
 * folds each new final result into the session transcript, keeping only what
 * is genuinely new.
 */

/** Minimum number of overlapping words before a prefix is treated as a repeat. */
const MIN_OVERLAP_WORDS = 3;

const normalizeWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, '');

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

const normWords = (s: string) => words(s).map(normalizeWord).filter(Boolean);

const startsWithWords = (haystack: string[], prefix: string[]) =>
  prefix.length > 0 &&
  prefix.length <= haystack.length &&
  prefix.every((w, i) => haystack[i] === w);

const endsWithWords = (haystack: string[], suffix: string[]) =>
  suffix.length > 0 &&
  suffix.length <= haystack.length &&
  suffix.every((w, i) => haystack[haystack.length - suffix.length + i] === w);

/** Collapse whitespace, including stray leading spaces some engines add. */
export const cleanSpoken = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Merge a new final result into the transcript of the current dictation session.
 * Returns the full, updated session transcript.
 */
export function mergeFinal(session: string, incoming: string): string {
  const next = cleanSpoken(incoming);
  if (!next) return session;
  const current = cleanSpoken(session);
  if (!current) return next;

  const cur = normWords(current);
  const inc = normWords(next);
  if (inc.length === 0) return current;

  // 1. Cumulative result covering the whole session so far -> it replaces it.
  if (startsWithWords(inc, cur)) return next;

  // 2. Repeat of text we already have at the end (iOS final-on-stop, re-sent segment).
  if (endsWithWords(cur, inc)) return current;

  // 3. Cumulative result of the latest segment only ("hello" -> "hello world").
  //    Find the longest tail of the session that the incoming result starts with.
  const rawCur = words(current);
  const rawInc = words(next);
  for (let k = Math.min(cur.length, inc.length); k >= 1; k--) {
    const tail = cur.slice(cur.length - k);
    if (!startsWithWords(inc, tail)) continue;
    // Short overlaps ("the", "I") are usually coincidence, not a repeat, unless
    // the overlap is the entire incoming result.
    if (k < MIN_OVERLAP_WORDS && k < inc.length) break;
    const kept = rawCur.slice(0, rawCur.length - k);
    return [...kept, ...rawInc].join(' ');
  }

  // 4. Genuinely new speech.
  return `${current} ${next}`;
}

/**
 * Capitalize the first letter of a dictated chunk when it starts a sentence,
 * since Android returns segments in lower case without punctuation.
 */
export function capitalizeIfSentenceStart(before: string, chunk: string): string {
  const prev = before.trimEnd();
  const startsSentence = prev === '' || /\n\s*$/.test(before) || /[.!?:]$/.test(prev);
  if (!startsSentence) return chunk;
  return chunk.replace(/^(\s*)(\p{Ll})/u, (_m, ws, ch) => ws + ch.toUpperCase());
}

/** Bookkeeping for one dictation session. */
export interface DictationSession {
  /** Merged, de-duplicated transcript of this session. */
  session: string;
  /** Leading part of `session` already frozen into the doc (user edited after it). */
  locked: string;
  /** Exact text this session last wrote at the end of the doc, or null if nothing yet. */
  inserted: string | null;
  /** Separator placed before this session's text ('\n\n', ' ', or ''). */
  sep: string | null;
}

export const newDictationSession = (): DictationSession => ({
  session: '',
  locked: '',
  inserted: null,
  sep: null,
});

/**
 * Fold a final speech result into the document without duplicating text.
 * The session transcript is merged first, then the doc's tail (the text this
 * session wrote) is rewritten from it. Mutates `d`; returns the new document.
 */
export function applyFinalResult(d: DictationSession, doc: string, spoken: string): string {
  const prevSession = d.session;
  const nextSession = mergeFinal(prevSession, spoken);
  if (nextSession === prevSession) return doc;
  d.session = nextSession;

  let base = doc;
  if (d.inserted !== null) {
    if (doc.endsWith(d.inserted)) {
      base = doc.slice(0, doc.length - d.inserted.length);
    } else {
      // The user edited the dictated text: keep their edits and only add new speech.
      d.locked = prevSession;
      d.sep = null;
    }
  }

  let fresh = nextSession;
  if (d.locked) {
    fresh = nextSession.startsWith(d.locked)
      ? nextSession.slice(d.locked.length).trim()
      : cleanSpoken(spoken);
  }

  if (d.sep === null) {
    base = base.trimEnd();
    // Each dictation starts its own paragraph so transcripts stay easy to read and copy.
    d.sep = base ? (d.locked ? ' ' : '\n\n') : '';
  }

  const chunk = fresh ? d.sep + capitalizeIfSentenceStart(base + d.sep, fresh) : '';
  d.inserted = chunk;
  return base + chunk;
}
