/**
 * A first-pass screen for text people publish. It does not decide what is
 * acceptable: it decides what a human should look at *before* strangers see it.
 *
 * Anything it flags is held back (the post is saved but shown only to its
 * author) and goes to the moderation queue. A false alarm costs a short delay; a
 * miss is caught by reports and the normal moderation tools. It is deliberately
 * simple, explainable and tunable by staff (the term list is a system setting,
 * not code), and it is one layer of several, not the safety system.
 */
export interface Screening {
  /** Nothing to look at. */
  clean: boolean;
  /** Why it was flagged: short machine-readable codes for the moderation queue. */
  reasons: string[];
}

const ZERO_WIDTH = /[\u200B-\u200F\u2060\uFEFF]/g;

/** Lower-case, compatibility-folded, zero-width characters removed, spaces collapsed. */
export function foldForMatching(text: string): string {
  return text.normalize('NFKC').replace(ZERO_WIDTH, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function screenText(text: string, blockedTerms: readonly string[] = []): Screening {
  const reasons: string[] = [];
  const folded = foldForMatching(text);

  for (const raw of blockedTerms) {
    const term = foldForMatching(raw).trim();
    if (term.length < 2) continue;
    // Whole-word for terms made of word characters, so a banned word does not catch
    // an innocent one that contains it; plain substring for phrases and other scripts.
    const pattern = /^[\p{L}\p{N}_]+$/u.test(term)
      ? new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(term)}(?![\\p{L}\\p{N}_])`, 'u')
      : new RegExp(escapeRegExp(term), 'u');
    if (pattern.test(folded)) {
      reasons.push('blocked_term');
      break;
    }
  }

  const links = folded.match(/\b(?:https?:\/\/|www\.)\S+/g)?.length ?? 0;
  if (links > 5) reasons.push('too_many_links');

  // One character 30 times in a row, or one word 20 times in a row: spam, not speech.
  if (/(\S)\1{29,}/u.test(folded) || /\b(\p{L}{2,})(?:\s+\1\b){19,}/u.test(folded)) {
    reasons.push('repetition');
  }
  return { clean: reasons.length === 0, reasons };
}
