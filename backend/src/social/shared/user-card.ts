import type { Prisma } from '../../generated/prisma/client.js';
import { type MediaViews, mediaSelect } from './media-views.js';

/** The few fields of a person that appear next to their content. */
export const userCardSelect = {
  id: true,
  username: true,
  status: true,
  profile: {
    select: {
      displayName: true,
      badge: true,
      isPrivate: true,
      avatar: { select: mediaSelect },
    },
  },
} satisfies Prisma.UserSelect;

export type UserCardRow = Prisma.UserGetPayload<{ select: typeof userCardSelect }>;

export interface UserCard {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  badge: string;
  isPrivate: boolean;
}

export function toUserCard(u: UserCardRow, media: MediaViews): UserCard {
  // An erased or suspended account is shown as a placeholder, never with its details.
  if (u.status === 'DELETED') {
    return {
      id: u.id,
      username: u.username,
      displayName: 'Deleted user',
      avatarUrl: null,
      badge: 'NONE',
      isPrivate: true,
    };
  }
  return {
    id: u.id,
    username: u.username,
    displayName: u.profile?.displayName ?? u.username,
    avatarUrl: media.avatarUrl(u.profile?.avatar),
    badge: u.profile?.badge ?? 'NONE',
    isPrivate: u.profile?.isPrivate ?? false,
  };
}
