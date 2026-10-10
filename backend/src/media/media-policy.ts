import type { MediaKind, MediaPurpose } from '../generated/prisma/client.js';

const MiB = 1024 * 1024;

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'] as const;

export interface KindRule {
  mimes: readonly string[];
  maxBytes: number;
  /** Longest a video may run. Absent for images. */
  maxDurationMs?: number;
}

export interface PurposeRule {
  IMAGE?: KindRule;
  VIDEO?: KindRule;
}

/**
 * What the app may upload for each purpose. This is the allow-list: a purpose or a
 * file type not listed here cannot be uploaded through the app at all.
 *
 * Deliberately absent: `REEL_VIDEO` (produced by the server from clips),
 * `MUSIC_*` (uploaded by staff), `KYC_DOCUMENT` (its own, stricter flow). A
 * client asking for one of those is refused.
 */
export const PURPOSE_RULES: Partial<Record<MediaPurpose, PurposeRule>> = {
  POST_IMAGE: { IMAGE: { mimes: IMAGE_MIMES, maxBytes: 15 * MiB } },
  AVATAR: { IMAGE: { mimes: IMAGE_MIMES, maxBytes: 5 * MiB } },
  REEL_COVER: { IMAGE: { mimes: IMAGE_MIMES, maxBytes: 5 * MiB } },
  BUSINESS_IMAGE: { IMAGE: { mimes: IMAGE_MIMES, maxBytes: 10 * MiB } },
  STORY: {
    IMAGE: { mimes: IMAGE_MIMES, maxBytes: 15 * MiB },
    VIDEO: { mimes: VIDEO_MIMES, maxBytes: 100 * MiB, maxDurationMs: 60_000 },
  },
  REEL_CLIP: {
    IMAGE: { mimes: IMAGE_MIMES, maxBytes: 15 * MiB },
    VIDEO: { mimes: VIDEO_MIMES, maxBytes: 250 * MiB, maxDurationMs: 180_000 },
  },
  AD_CREATIVE: {
    IMAGE: { mimes: IMAGE_MIMES, maxBytes: 10 * MiB },
    VIDEO: { mimes: VIDEO_MIMES, maxBytes: 100 * MiB, maxDurationMs: 60_000 },
  },
};

export const UPLOADABLE_PURPOSES = Object.keys(PURPOSE_RULES) as MediaPurpose[];

export function ruleFor(purpose: MediaPurpose, kind: MediaKind): KindRule | undefined {
  if (kind !== 'IMAGE' && kind !== 'VIDEO') return undefined;
  return PURPOSE_RULES[purpose]?.[kind];
}

/** The file extension to give a stored object. Chosen by us from the verified type, never from the client's name. */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
};

export function extensionFor(mime: string): string {
  return EXTENSIONS[mime] ?? 'bin';
}

/** Uploads larger than this use several parts that are sent independently (and can be resumed). */
export const SINGLE_UPLOAD_MAX_BYTES = 16 * MiB;
export const PART_SIZE_BYTES = 8 * MiB;
/** A person can have this many uploads waiting to be finished. */
export const MAX_OPEN_UPLOADS = 30;
/** And may announce this many bytes of uploads in 24 hours. */
export const MAX_DAILY_UPLOAD_BYTES = 2048 * MiB;
