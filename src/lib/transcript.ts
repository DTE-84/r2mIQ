/**
 * Transcript merging for live dictation.
 *
 * Speech engines do not agree on what a "final" result contains:
 *  - Android 13+ (native) sends each finished segment once.
 *  - Chrome on Android (web, continuous mode) re-sends the sentence so far as a
 *    new "final" every time ("hello" -> "hello world" -> "hello world how").
 *  - iOS 18 emits "final-like" results after each pause, then a true final on
 *    stop that can repeat the last segment, or the entire session.
 *
 * Appending every final result blindly therefore doubles text. A session keeps
 * the text before the latest segment (`before`) separately from the latest
 * segment itself (`last`), so a result that extends or repeats the latest
 * segment replaces it instead of being appended.
 */

/** Minimum number of overlapping words before a fuzzy overlap is treated as a repeat. */
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

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b);

/** Collapse whitespace, including stray leading spaces some engines add. */
export const cleanSpoken = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Bookkeeping for one dictation session. */
export interface DictationSession {
  /** Session text before the latest segment. */
  before: string;
  /** The latest segment, which later results may extend or repeat. */
  last: string;
  /** Leading part of the session already frozen into the doc (user edited after it). */
  locked: string;
  /** Exact text this session last wrote at the end of the doc, or null if nothing yet. */
  inserted: string | null;
  /** Separator placed before this session's text ('\n\n', ' ', or ''). */
  sep: string | null;
}

export const newDictationSession = (): DictationSession => ({
  before: '',
  last: '',
  locked: '',
  inserted: null,
  sep: null,
});

/** Full, merged transcript of the session. */
export const sessionText = (d: Pick<DictationSession, 'before' | 'last'>) => join(d.before, d.last);

/**
 * The speech engine was restarted (it stopped on its own and we resumed).
 * A new engine run never repeats the previous run's text, so close the segment.
 */
export function markEngineRestart(d: DictationSession) {
  d.before = sessionText(d);
  d.last = '';
}

/**
 * Merge a new final result into the session's `before`/`last` state.
 * Returns true if the session text changed.
 */
export function mergeFinal(d: Pick<DictationSession, 'before' | 'last'>, incoming: string): boolean {
  const inc = cleanSpoken(incoming);
  const incW = normWords(inc);
  if (incW.length === 0) return false;

  const session = sessionText(d);
  const sesW = normWords(session);
  const lastW = normWords(d.last);

  // 1. Cumulative result covering the whole session so far: it replaces it.
  if (startsWithWords(incW, sesW)) {
    if (inc === session) return false;
    d.before = '';
    d.last = inc;
    return true;
  }

  // 2. Extension of the latest segment ("second" -> "second point").
  if (startsWithWords(incW, lastW)) {
    if (inc === d.last) return false;
    d.last = inc;
    return true;
  }

  // 3. Repeat of text we already have (iOS final-on-stop, re-sent segment).
  if (endsWithWords(sesW, incW) || startsWithWords(lastW, incW)) return false;

  // 4. Result that re-sends the end of the session plus new words. Short
  //    overlaps ("the", "I") are usually coincidence, so require a few words.
  const rawSes = words(session);
  for (let k = Math.min(sesW.length, incW.length) - 1; k >= MIN_OVERLAP_WORDS; k--) {
    if (!startsWithWords(incW, sesW.slice(sesW.length - k))) continue;
    d.before = rawSes.slice(0, rawSes.length - k).join(' ');
    d.last = inc;
    return true;
  }

  // 5. Genuinely new speech.
  d.before = session;
  d.last = inc;
  return true;
}

/**
 * Capitalize the first letter of a dictated chunk when it starts a sentence,
 * since Android returns segments in lower case without punctuation.
 */
export function capitalizeIfSentenceStart(before: string, chunk: string): string {
  const prev = before.trimEnd();
  const startsSentence = prev === '' || /\n\s*$/.test(before) || /[.!?:]$/.test(prev);
  // Also capitalize sentences inside the chunk, since segments get joined mid-session.
  const inner = chunk.replace(/([.!?]\s+)(\p{Ll})/gu, (_m, gap, ch) => gap + ch.toUpperCase());
  if (!startsSentence) return inner;
  return inner.replace(/^(\s*)(\p{Ll})/u, (_m, ws, ch) => ws + ch.toUpperCase());
}

/**
 * Fold a final speech result into the document without duplicating text.
 * The session transcript is merged first, then the doc's tail (the text this
 * session wrote) is rewritten from it. Mutates `d`; returns the new document.
 */
export function applyFinalResult(d: DictationSession, doc: string, spoken: string): string {
  const prevSession = sessionText(d);
  if (!mergeFinal(d, spoken)) return doc;
  const nextSession = sessionText(d);

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
