import { Injectable } from '@nestjs/common';
import { Errors } from '../../common/errors/app-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import { cleanLine } from '../shared/text.js';

export type TrendScopeName = 'district' | 'state' | 'national' | 'global';

/**
 * What is being talked about, by place.
 *
 * Counted from posts anyone could open (approved, public, from an open account,
 * not deleted) in the last day: a tag that only appears in held or private posts
 * can never trend. A tag must be used by at least two different posts. The
 * numbers are recomputed on a timer and read from a table, so the request path
 * does no counting.
 */
@Injectable()
export class TrendingService {
  constructor(private readonly prisma: PrismaService) {}

  async recompute(): Promise<number> {
    const startedAt = new Date();
    // A district's name is not unique across states ("Aurangabad"), so its key carries the state.
    const rows = await this.prisma.$executeRaw`
      WITH eligible AS (
        SELECT p.id, p.country, p.state, p.district, p.likes_count, unnest(p.hashtags) AS tag
          FROM posts p
          JOIN profiles pr ON pr.user_id = p.author_id
          JOIN users u ON u.id = p.author_id
         WHERE p.published_at > now() - interval '24 hours'
           AND p.deleted_at IS NULL
           AND p.moderation_status = 'APPROVED'
           AND p.visibility = 'PUBLIC'
           AND pr.is_private = false
           AND u.status = 'ACTIVE'),
      scored AS (
        SELECT 'DISTRICT'::trend_scope AS scope, state || '/' || district AS scope_key, tag,
               count(*)::float8 + 0.1 * coalesce(sum(likes_count), 0) AS score, count(*)::int AS posts
          FROM eligible WHERE district IS NOT NULL AND state IS NOT NULL GROUP BY state, district, tag HAVING count(*) >= 2
        UNION ALL
        SELECT 'STATE', state, tag, count(*)::float8 + 0.1 * coalesce(sum(likes_count), 0), count(*)::int
          FROM eligible WHERE state IS NOT NULL GROUP BY state, tag HAVING count(*) >= 2
        UNION ALL
        SELECT 'NATIONAL', '', tag, count(*)::float8 + 0.1 * coalesce(sum(likes_count), 0), count(*)::int
          FROM eligible GROUP BY tag HAVING count(*) >= 2)
      INSERT INTO trending_topics (id, scope, scope_key, tag, score, posts_count, computed_at)
      SELECT gen_random_uuid(), scope, scope_key, tag, score, posts, ${startedAt}::timestamptz FROM scored
      ON CONFLICT (scope, scope_key, tag)
      DO UPDATE SET score = EXCLUDED.score, posts_count = EXCLUDED.posts_count, computed_at = EXCLUDED.computed_at`;
    // Anything not refreshed this time has stopped trending.
    await this.prisma.trendingTopic.deleteMany({ where: { computedAt: { lt: startedAt } } });
    return rows;
  }

  /** The top tags for one rung, relative to where the viewer is. */
  async top(viewerId: string, scope: TrendScopeName, limit = 20) {
    const me = await this.prisma.profile.findUnique({
      where: { userId: viewerId },
      select: { state: true, district: true },
    });
    let where: { scope: 'DISTRICT' | 'STATE' | 'NATIONAL' | 'GLOBAL'; scopeKey: string };
    switch (scope) {
      case 'district':
        if (!me?.state || !me.district) return { scope, key: null, topics: [] };
        where = { scope: 'DISTRICT', scopeKey: `${me.state}/${me.district}` };
        break;
      case 'state':
        if (!me?.state) return { scope, key: null, topics: [] };
        where = { scope: 'STATE', scopeKey: me.state };
        break;
      case 'national':
        where = { scope: 'NATIONAL', scopeKey: '' };
        break;
      default:
        // The Global rung is earned per post; there is no separate global tag count yet.
        where = { scope: 'NATIONAL', scopeKey: '' };
    }
    const rows = await this.prisma.trendingTopic.findMany({
      where,
      orderBy: [{ score: 'desc' }, { tag: 'asc' }],
      take: Math.min(limit, 50),
    });
    return {
      scope,
      key: where.scopeKey || null,
      topics: rows.map((r, i) => ({ rank: i + 1, tag: r.tag, posts: r.postsCount })),
    };
  }

  /** Tag suggestions as someone types: trending tags first, then any tag that starts that way on recent posts. */
  async suggest(query: string, limit = 10) {
    const q = cleanLine(query).replace(/^#/, '').toLowerCase();
    if (q.length < 2) return [];
    if (!/^[\p{L}\p{N}\p{M}_]+$/u.test(q))
      throw Errors.validation([{ field: 'q', reasons: ['invalid'] }]);
    const trending = await this.prisma.trendingTopic.groupBy({
      by: ['tag'],
      where: { tag: { startsWith: q } },
      _max: { score: true },
      _sum: { postsCount: true },
      orderBy: { _max: { score: 'desc' } },
      take: limit,
    });
    return trending.map((t) => ({ tag: t.tag, posts: t._sum.postsCount ?? 0 }));
  }
}
