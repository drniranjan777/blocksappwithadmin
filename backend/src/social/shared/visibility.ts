import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Who may see a person's content, written once as a database filter.
 *
 * Every read of posts, reels and their lists goes through this, so the rules
 * cannot differ between the profile page, the feed, search and a direct link:
 *
 *   - the author always sees their own content, whatever its state;
 *   - nobody else sees anything that is deleted, not approved, or from an account
 *     that is not active;
 *   - nothing is shown across a block, in either direction;
 *   - PUBLIC reaches everyone, unless the account is private, when it reaches
 *     only accepted followers;
 *   - FOLLOWERS reaches accepted followers; CLOSE_FRIENDS only those the author
 *     marked; PRIVATE only the author.
 *
 * A filter, not a per-row check, so lists stay one query and a page can never
 * leak a row that a later check would have hidden.
 */
export interface Scope {
  /** The signed-in viewer. */
  viewerId: string;
}

const followerOf = (viewerId: string, extra: Prisma.FollowWhereInput = {}) => ({
  followers: { some: { followerId: viewerId, status: 'ACCEPTED' as const, ...extra } },
});

/** The author-side conditions shared by posts and reels. */
function authorConditions(viewerId: string): Prisma.UserWhereInput {
  return {
    status: 'ACTIVE',
    // Neither side has blocked the other.
    blocksReceived: { none: { blockerId: viewerId, kind: 'BLOCK' } },
    blocksMade: { none: { blockedId: viewerId, kind: 'BLOCK' } },
  };
}

function visibilityBranches(viewerId: string) {
  return [
    {
      visibility: 'PUBLIC' as const,
      author: { profile: { isPrivate: false } },
    },
    {
      visibility: { in: ['PUBLIC', 'FOLLOWERS'] as ('PUBLIC' | 'FOLLOWERS')[] },
      author: followerOf(viewerId),
    },
    {
      visibility: 'CLOSE_FRIENDS' as const,
      author: followerOf(viewerId, { closeFriend: true }),
    },
  ];
}

/** Posts the viewer may see. Combine with other filters through `AND`. */
export function postVisibleTo(viewerId: string): Prisma.PostWhereInput {
  return {
    deletedAt: null,
    OR: [
      { authorId: viewerId },
      {
        moderationStatus: 'APPROVED',
        author: authorConditions(viewerId),
        OR: visibilityBranches(viewerId),
        // Posted as a business page: only while the page is published (staff can suspend it).
        AND: [{ OR: [{ businessPageId: null }, { businessPage: { status: 'ACTIVE' } }] }],
      },
    ],
  };
}

/** Reels the viewer may see: as posts, and only once published. */
export function reelVisibleTo(viewerId: string): Prisma.ReelWhereInput {
  return {
    deletedAt: null,
    OR: [
      { authorId: viewerId },
      {
        moderationStatus: 'APPROVED',
        publishStatus: 'PUBLISHED',
        author: authorConditions(viewerId),
        OR: visibilityBranches(viewerId),
      },
    ],
  };
}

/** Stories the viewer may see: unexpired, approved, and visible by the same rules. */
export function storyVisibleTo(viewerId: string, now = new Date()): Prisma.StoryWhereInput {
  return {
    deletedAt: null,
    expiresAt: { gt: now },
    OR: [
      { authorId: viewerId },
      {
        moderationStatus: 'APPROVED',
        author: authorConditions(viewerId),
        OR: visibilityBranches(viewerId),
      },
    ],
  };
}

/** Leave out people the viewer has muted (feeds only; a profile can still be opened). */
export function notMutedBy(viewerId: string): Prisma.UserWhereInput {
  return { blocksReceived: { none: { blockerId: viewerId, kind: 'MUTE' } } };
}
