/**
 * Speech recognizers don't agree on what a "final" result contains. Desktop
 * Chrome sends each new phrase once, but Android (Chrome and native) often
 * sends the whole transcript so far ("hello" → "hello world" → "hello world
 * how are you") and can repeat the same final twice. Appending every final
 * as-is produces paragraphs of repeats.
 *
 * mergeTranscript compares an incoming final result against what this
 * dictation session has already committed and returns only the new words.
 */

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

function toWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Number of words at the end of `committed` that match the start of `incoming`
 * (case and punctuation ignored).
 */
function overlapLength(committed: string[], incoming: string[]): number {
  const a = committed.map(normalizeWord);
  const b = incoming.map(normalizeWord);
  const max = Math.min(a.length, b.length);
  for (let len = max; len > 0; len--) {
    let match = true;
    for (let i = 0; i < len; i++) {
      if (a[a.length - len + i] !== b[i]) {
        match = false;
        break;
      }
    }
    if (match) return len;
  }
  return 0;
}

export interface MergeResult {
  /** The session transcript after this result. */
  session: string;
  /** Only the words to append to the document (empty if nothing new). */
  added: string;
}

/**
 * @param session  Everything committed so far in this dictation session.
 * @param incoming The recognizer's latest final transcript.
 */
export function mergeTranscript(session: string, incoming: string): MergeResult {
  const committed = toWords(session);
  const next = toWords(incoming);
  if (next.length === 0) return { session, added: '' };
  if (committed.length === 0) return { session: next.join(' '), added: next.join(' ') };

  // Cumulative result: it restates the whole session so far, then continues.
  const restatesSession =
    next.length >= committed.length &&
    committed.every((word, i) => normalizeWord(word) === normalizeWord(next[i]));

  const overlap = overlapLength(committed, next);
  // Otherwise a one-word overlap is often a real repeat ("the … the"), so only
  // trust it when it covers the whole result (an exact duplicate).
  const skip = restatesSession
    ? committed.length
    : overlap >= 2 || overlap === next.length
      ? overlap
      : 0;
  const newWords = next.slice(skip);
  if (newWords.length === 0) return { session, added: '' };

  const added = newWords.join(' ');
  return { session: `${committed.join(' ')} ${added}`, added };
}

/** For the live preview: the part of an interim result not already committed. */
export function pendingInterim(session: string, interim: string): string {
  const committed = toWords(session);
  const next = toWords(interim);
  return next.slice(overlapLength(committed, next)).join(' ');
}
