/**
 * Pulling hashtags and mentions out of a caption or comment.
 *
 * Both are found by the server, never trusted from the client: a client that
 * could say "this post mentions these 500 people" could use mentions to spam.
 */

/**
 * Hashtags: letters, digits or underscore in any script, 2 to 50 characters, with at least
 * one letter. Combining marks (`\p{M}`) are part of a word: Telugu, Hindi and most Indian
 * scripts write vowels as marks, so without them `#हिंदी` would stop after its first letter.
 */
const HASHTAG = /(?:^|[^\p{L}\p{N}\p{M}_&#])#([\p{L}\p{N}\p{M}_]{2,50})(?![\p{L}\p{N}\p{M}_])/gu;

/** Mentions: a username as the platform defines it (a-z 0-9 . _), after something that is not part of a word or address. */
const MENTION = /(?:^|[^\p{L}\p{N}_.@])@([a-z0-9._]{3,30})(?![a-z0-9_@])/giu;

export const MAX_HASHTAGS = 30;
export const MAX_MENTIONS = 20;

/** Lower-case, de-duplicated, in first-seen order. */
export function extractHashtags(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.normalize('NFC').matchAll(HASHTAG)) {
    const tag = (match[1] ?? '').toLowerCase();
    if (/\p{L}/u.test(tag)) seen.add(tag);
  }
  return [...seen];
}

/** Lower-case usernames without the @, de-duplicated, in first-seen order. Trailing dots are not part of a name. */
export function extractMentions(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION)) {
    const name = (match[1] ?? '').toLowerCase().replace(/\.+$/, '');
    if (name.length >= 3) seen.add(name);
  }
  return [...seen];
}
