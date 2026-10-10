/**
 * Cleaning for text that people type and others read.
 *
 * What is removed, and why:
 *   - control characters, which have no business in a name or a caption;
 *   - the Unicode bidirectional *override* controls (U+202A-202E, U+2066-2069),
 *     which can make one string display as another (a spoofing trick);
 *   - zero-width characters, which make two different names look identical.
 * Text is normalised to NFC so the same word typed two ways compares equal.
 *
 * Nothing here escapes HTML: the API returns JSON and clients render text as
 * text. Escaping at the source would double-escape in every client.
 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const BIDI_AND_ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

function strip(value: string): string {
  return value.normalize('NFC').replace(CONTROL, '').replace(BIDI_AND_ZERO_WIDTH, '');
}

/** One line: whitespace collapsed, trimmed. For names, titles, places. */
export function cleanLine(value: string): string {
  return strip(value).replace(/\s+/g, ' ').trim();
}

/** Several lines allowed (captions, bios): runs of blank lines are shortened, edges trimmed. */
export function cleanText(value: string): string {
  return strip(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** An http(s) address without credentials, or `undefined`. Normalised by the URL parser. */
export function cleanUrl(value: string, maxLength = 200): string | undefined {
  const text = value.trim();
  if (!text || text.length > maxLength) return undefined;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.username || url.password) return undefined;
  if (!url.hostname.includes('.')) return undefined;
  const out = url.toString();
  return out.length <= maxLength ? out : undefined;
}
