import { fileTypeFromBuffer } from 'file-type';

/** Enough of the start of a file to recognise its type. */
export const SNIFF_BYTES = 4100;

/**
 * The type of a file as its **bytes** say it is, which is the only thing worth
 * trusting. The type a client declares, and the name it gives, are just claims: a
 * script renamed `holiday.jpg` is still a script.
 *
 * Returns `undefined` for anything not recognised, which the caller treats as
 * "not an allowed file".
 */
export async function sniffMime(head: Buffer): Promise<string | undefined> {
  if (head.length < 12) return undefined;
  const found = await fileTypeFromBuffer(head);
  if (found) return normalise(found.mime);
  return undefined;
}

/** Some containers are reported under more than one name; fold them to the ones we use. */
function normalise(raw: string): string {
  // `audio/ogg; codecs=opus` is just `audio/ogg`.
  const mime = raw.split(';')[0]?.trim() ?? raw;
  switch (mime) {
    case 'audio/x-m4a':
      return 'audio/mp4';
    case 'audio/x-wav':
    case 'audio/vnd.wave':
      return 'audio/wav';
    case 'video/x-m4v':
      return 'video/mp4';
    case 'video/3gpp2':
      return 'video/3gpp';
    case 'video/x-matroska':
      return 'video/webm';
    default:
      return mime;
  }
}

/**
 * Does what the bytes say fit what was declared? Phones label the same ISO-media file
 * `video/mp4`, `video/quicktime` or `video/3gpp` interchangeably, so those count as
 * one family; everything else must match exactly.
 */
export function compatibleTypes(declared: string, detected: string): boolean {
  if (declared === detected) return true;
  const family = new Set(['video/mp4', 'video/quicktime', 'video/3gpp']);
  return family.has(declared) && family.has(detected);
}
