import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { RelationshipsService } from './relationships.service.js';

/**
 * Telling people they were mentioned, the same way for posts and reels.
 *
 * Only people who could actually open the content are told: a mention in a private
 * post, or in a post for followers that the person does not follow, would otherwise
 * reveal that it exists. Nobody is told while the content is held for review (the
 * caller announces after release), and a retry never tells twice (`dedupeKey`).
 */
@Injectable()
export class MentionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationships: RelationshipsService,
    private readonly notifications: NotificationService,
  ) {}

  /** Usernames in the text that are real, active, not the author, and not on either side of a block. */
  async resolve(authorId: string, names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: {
        username: { in: names },
        status: 'ACTIVE',
        id: { not: authorId },
        blocksReceived: { none: { blockerId: authorId, kind: 'BLOCK' } },
        blocksMade: { none: { blockedId: authorId, kind: 'BLOCK' } },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  async announce(input: {
    kind: 'post' | 'reel';
    id: string;
    authorId: string;
    visibility: string;
    mentioned: readonly string[];
  }): Promise<void> {
    const { kind, id, authorId, visibility, mentioned } = input;
    if (mentioned.length === 0 || visibility === 'PRIVATE') return;
    const [author, relations] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { userId: authorId },
        select: { displayName: true, isPrivate: true },
      }),
      this.relationships.between(authorId, [...mentioned]),
    ]);
    for (const userId of mentioned) {
      const follows = relations.get(userId)?.followedBy ?? false;
      const open = visibility === 'PUBLIC' && !author?.isPrivate;
      if (!open && !follows) continue;
      await this.notifications
        .notify({
          userId,
          type: 'MENTION',
          template: 'social_mention',
          vars: { actor: author?.displayName ?? 'Someone', target: kind },
          severity: 'INFO',
          category: 'social',
          data: { [`${kind}Id`]: id, userId: authorId },
          dedupeKey: `mention:${kind}:${id}`,
        })
        .catch(() => undefined);
    }
  }
}
