import type { Prisma } from '../../generated/prisma/client.js';
import { type MediaView, type MediaViews, mediaSelect } from '../shared/media-views.js';
import {
  type UserCard,
  type UserCardRow,
  toUserCard,
  userCardSelect,
} from '../shared/user-card.js';

/** Everything needed to show a post. Use it wherever posts are read, so every list looks the same. */
export const postInclude = {
  author: { select: userCardSelect },
  businessPage: { select: { id: true, slug: true, name: true, verificationStatus: true } },
  media: {
    orderBy: { position: 'asc' as const },
    select: { position: true, mediaAsset: { select: mediaSelect } },
  },
} satisfies Prisma.PostInclude;

export type PostRow = Prisma.PostGetPayload<{ include: typeof postInclude }>;

/** What the signed-in viewer has done with a set of posts. */
export interface ViewerState {
  liked: Set<string>;
  saved: Set<string>;
}

export interface PostView {
  id: string;
  type: string;
  caption: string;
  visibility: string;
  label: string;
  hashtags: string[];
  author: UserCard;
  /** Present when it was posted on behalf of a business page. */
  businessPage?: { id: string; slug: string; name: string; verified: boolean };
  media: MediaView[];
  location: { country: string; state: string | null; district: string | null };
  counts: { likes: number; comments: number; shares: number; saves: number; views: number };
  viewer: { liked: boolean; saved: boolean; isAuthor: boolean };
  allowComments: boolean;
  allowSharing: boolean;
  reachLevel: string;
  /** Only the author sees this: whether the post is public yet, and if not, why not. */
  moderation?: { status: string; held: boolean };
  publishedAt: string;
  editedAt: string | null;
}

export function toPostView(
  post: PostRow,
  viewerId: string,
  state: ViewerState,
  media: MediaViews,
): PostView {
  const isAuthor = post.authorId === viewerId;
  const views = post.media
    .map((m) => media.view(m.mediaAsset))
    .filter((m): m is MediaView => m !== null);
  return {
    id: post.id,
    type: post.type,
    caption: post.caption,
    visibility: post.visibility,
    label: post.label,
    hashtags: post.hashtags,
    author: toUserCard(post.author as UserCardRow, media),
    ...(post.businessPage
      ? {
          businessPage: {
            id: post.businessPage.id,
            slug: post.businessPage.slug,
            name: post.businessPage.name,
            verified: post.businessPage.verificationStatus === 'APPROVED',
          },
        }
      : {}),
    media: views,
    location: { country: post.country, state: post.state, district: post.district },
    counts: {
      likes: post.likesCount,
      comments: post.commentsCount,
      shares: post.sharesCount,
      saves: post.savesCount,
      views: post.viewsCount,
    },
    viewer: { liked: state.liked.has(post.id), saved: state.saved.has(post.id), isAuthor },
    allowComments: post.allowComments,
    allowSharing: post.allowSharing,
    reachLevel: post.reachLevel,
    ...(isAuthor
      ? {
          moderation: {
            status: post.moderationStatus,
            held: post.moderationStatus !== 'APPROVED',
          },
        }
      : {}),
    publishedAt: post.publishedAt.toISOString(),
    editedAt: post.editedAt?.toISOString() ?? null,
  };
}
