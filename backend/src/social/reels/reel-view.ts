import type { Prisma } from '../../generated/prisma/client.js';
import { type MediaView, type MediaViews, mediaSelect } from '../shared/media-views.js';
import {
  type UserCard,
  type UserCardRow,
  toUserCard,
  userCardSelect,
} from '../shared/user-card.js';

/** Everything needed to show a reel. Use it wherever reels are read, so every list looks the same. */
export const reelInclude = {
  author: { select: userCardSelect },
  video: { select: mediaSelect },
  cover: { select: mediaSelect },
  music: {
    select: { id: true, title: true, artist: true, status: true, coverKey: true, previewKey: true },
  },
  reusedAudio: { select: { id: true, title: true } },
  originalAudio: { select: { id: true, title: true, reusable: true } },
} satisfies Prisma.ReelInclude;

export type ReelRow = Prisma.ReelGetPayload<{ include: typeof reelInclude }>;

/** What the signed-in viewer has done with a set of reels. */
export interface ReelViewerState {
  liked: Set<string>;
  saved: Set<string>;
}

export interface ReelView {
  id: string;
  caption: string;
  visibility: string;
  label: string;
  hashtags: string[];
  author: UserCard;
  /** `null` while the reel is still being put together. */
  video: MediaView | null;
  coverUrl: string | null;
  durationMs: number;
  clipCount: number;
  /** The licensed track under the reel, if any. A track that has since been taken down has no preview. */
  music: {
    id: string;
    title: string;
    artist: string;
    coverUrl: string | null;
    previewUrl: string | null;
  } | null;
  /** The reel's own sound, if others may reuse it. */
  originalAudio: { id: string; title: string; reusable: boolean } | null;
  /** Another creator's sound this reel reuses. */
  reusedAudio: { id: string; title: string } | null;
  /** Text and stickers the creator placed, for the app to draw over the video. */
  overlays: unknown[];
  location: { country: string; state: string | null; district: string | null };
  counts: { likes: number; comments: number; shares: number; saves: number; views: number };
  viewer: { liked: boolean; saved: boolean; isAuthor: boolean };
  allowComments: boolean;
  allowRemix: boolean;
  allowSharing: boolean;
  reachLevel: string;
  /** Only the author sees this: where the reel is in being made and checked, and why it failed. */
  status?: { publish: string; moderation: string; held: boolean; failureCode: string | null };
  publishedAt: string | null;
  createdAt: string;
}

export function toReelView(
  reel: ReelRow,
  viewerId: string,
  state: ReelViewerState,
  media: MediaViews,
): ReelView {
  const isAuthor = reel.authorId === viewerId;
  const video = media.view(reel.video);
  const cover = media.view(reel.cover);
  const edit = (reel.editMetadata ?? {}) as { overlays?: unknown[] };
  return {
    id: reel.id,
    caption: reel.caption,
    visibility: reel.visibility,
    label: reel.label,
    hashtags: reel.hashtags,
    author: toUserCard(reel.author as UserCardRow, media),
    video,
    coverUrl: cover?.thumbnailUrl ?? cover?.url ?? video?.posterUrl ?? video?.thumbnailUrl ?? null,
    durationMs: reel.durationMs,
    clipCount: reel.clipCount,
    music: reel.music
      ? {
          id: reel.music.id,
          title: reel.music.title,
          artist: reel.music.artist,
          coverUrl: media.link(reel.music.coverKey),
          previewUrl: reel.music.status === 'ACTIVE' ? media.link(reel.music.previewKey) : null,
        }
      : null,
    originalAudio: reel.originalAudio,
    reusedAudio: reel.reusedAudio,
    overlays: Array.isArray(edit.overlays) ? edit.overlays : [],
    location: { country: reel.country, state: reel.state, district: reel.district },
    counts: {
      likes: reel.likesCount,
      comments: reel.commentsCount,
      shares: reel.sharesCount,
      saves: reel.savesCount,
      views: reel.viewsCount,
    },
    viewer: { liked: state.liked.has(reel.id), saved: state.saved.has(reel.id), isAuthor },
    allowComments: reel.allowComments,
    allowRemix: reel.allowRemix,
    allowSharing: reel.allowSharing,
    reachLevel: reel.reachLevel,
    ...(isAuthor
      ? {
          status: {
            publish: reel.publishStatus,
            moderation: reel.moderationStatus,
            held: reel.publishStatus !== 'PUBLISHED',
            failureCode: reel.failureCode,
          },
        }
      : {}),
    publishedAt: reel.publishedAt?.toISOString() ?? null,
    createdAt: reel.createdAt.toISOString(),
  };
}
