import { Errors } from '../../common/errors/app-error.js';
import { isUuid } from '../../common/ids.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { RelationshipsService } from './relationships.service.js';

/**
 * The person whose posts or reels the viewer asked to list, if the viewer may list them.
 *
 * One rule for every "a person's things" list: an unknown, inactive or blocked account is
 * simply not found (it must look the same as one that does not exist), and a private
 * account is closed to anyone who is not an accepted follower (or the person themselves).
 */
export async function listedProfile(
  prisma: PrismaService,
  relationships: RelationshipsService,
  viewerId: string,
  ref: string,
): Promise<{ id: string }> {
  const cleaned = ref.trim().replace(/^@/, '').toLowerCase();
  const target = await prisma.user.findFirst({
    where: isUuid(cleaned) ? { id: cleaned } : { username: cleaned },
    select: { id: true, status: true, profile: { select: { isPrivate: true } } },
  });
  if (!target || target.status !== 'ACTIVE') throw Errors.notFound('Profile');
  const rel = await relationships.with(viewerId, target.id);
  if (rel.blockedBy || rel.blocked) throw Errors.notFound('Profile');
  if (target.id !== viewerId && (target.profile?.isPrivate ?? false) && !rel.following) {
    throw Errors.forbidden('This account is private. Follow it to see its posts.');
  }
  return { id: target.id };
}
