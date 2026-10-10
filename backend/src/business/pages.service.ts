import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Errors, type FieldIssue } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { Page, clampLimit, decodeCursor } from '../common/pagination/cursor.js';
import { SystemSettingsService } from '../common/settings/system-settings.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { type PostRow, type PostView, postInclude } from '../social/posts/post-view.js';
import { PostsService } from '../social/posts/posts.service.js';
import { screenText } from '../social/posts/text-safety.js';
import { type MediaView, MediaViews, mediaSelect } from '../social/shared/media-views.js';
import { postVisibleTo } from '../social/shared/visibility.js';
import { BUSINESS_CATEGORIES, safeWebUrl, slugProblem, slugify } from './business-rules.js';

export const MAX_PAGES_SETTING = 'business.max_pages_per_user';
export const DEFAULT_MAX_PAGES = 3;
const BLOCKED_TERMS_SETTING = 'moderation.blocked_terms';
const MAX_OFFERS = 20;
const cursorSchema = z.object({ t: z.string(), id: z.string() });

export interface PageInput {
  name?: string | undefined;
  slug?: string | undefined;
  category?: string | undefined;
  description?: string | null | undefined;
  contactEmail?: string | null | undefined;
  websiteUrl?: string | null | undefined;
  state?: string | null | undefined;
  district?: string | null | undefined;
  city?: string | null | undefined;
  avatarMediaId?: string | null | undefined;
  coverMediaId?: string | null | undefined;
}

const pageInclude = {
  avatar: { select: mediaSelect },
  cover: { select: mediaSelect },
} satisfies Prisma.BusinessPageInclude;
type PageRow = Prisma.BusinessPageGetPayload<{ include: typeof pageInclude }>;

export interface PageView {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  contactEmail: string | null;
  websiteUrl: string | null;
  location: { state: string | null; district: string | null; city: string | null };
  avatar: MediaView | null;
  cover: MediaView | null;
  /** A badge staff granted after reviewing it. */
  verified: boolean;
  followers: number;
  viewer: { following: boolean; isOwner: boolean };
  createdAt: string;
  /** Only the owner sees these. */
  manage?: {
    status: string;
    statusReason: string | null;
    verification: string;
    gstinLast4: string | null;
  };
}

/** Whether `viewerId` may see a page: their own at any stage, others' only once published and not blocked. */
export function pageVisibleTo(viewerId: string): Prisma.BusinessPageWhereInput {
  return {
    OR: [
      { ownerId: viewerId },
      {
        status: 'ACTIVE',
        owner: {
          status: 'ACTIVE',
          blocksReceived: { none: { blockerId: viewerId, kind: 'BLOCK' } },
          blocksMade: { none: { blockedId: viewerId, kind: 'BLOCK' } },
        },
      },
    ],
  };
}

/**
 * Business pages: creating one, editing it, publishing it, being followed, posting as it, and what
 * it shows its owner about how it is doing.
 *
 * A page is private (a draft) until its owner publishes it; staff can suspend a published one,
 * which hides it and everything posted as it. A page is a place to publish and to be found, not a
 * claim: the verified badge is separate and is only ever granted by staff (see `VerificationService`).
 * Changing the name of a verified page takes the badge away, because the badge was for that name.
 */
@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingsService,
    private readonly media: MediaViews,
    private readonly posts: PostsService,
  ) {}

  // ------------------------------------------------------------------ views --

  private view(p: PageRow, viewerId: string, following: boolean): PageView {
    const isOwner = p.ownerId === viewerId;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      description: p.description,
      contactEmail: p.contactEmail,
      websiteUrl: p.websiteUrl,
      location: { state: p.state, district: p.district, city: p.city },
      avatar: this.media.view(p.avatar),
      cover: this.media.view(p.cover),
      verified: p.verificationStatus === 'APPROVED',
      followers: p.followersCount,
      viewer: { following, isOwner },
      createdAt: p.createdAt.toISOString(),
      ...(isOwner
        ? {
            manage: {
              status: p.status,
              statusReason: p.status === 'SUSPENDED' ? p.statusReason : null,
              verification: p.verificationStatus,
              gstinLast4: p.gstinLast4,
            },
          }
        : {}),
    };
  }

  private async viewMany(viewerId: string, rows: PageRow[]): Promise<PageView[]> {
    if (rows.length === 0) return [];
    const follows = await this.prisma.businessFollow.findMany({
      where: { userId: viewerId, pageId: { in: rows.map((r) => r.id) } },
      select: { pageId: true },
    });
    const set = new Set(follows.map((f) => f.pageId));
    return rows.map((r) => this.view(r, viewerId, set.has(r.id)));
  }

  /** The page a person is allowed to see, by id or address. Anything else is "not found". */
  private async findVisible(viewerId: string, ref: string): Promise<PageRow> {
    const page = await this.prisma.businessPage.findFirst({
      where: {
        AND: [isUuid(ref) ? { id: ref } : { slug: ref.toLowerCase() }, pageVisibleTo(viewerId)],
      },
      include: pageInclude,
    });
    if (!page) throw Errors.notFound('Page');
    return page;
  }

  /** A page the person owns and may still change. */
  private async findOwned(userId: string, id: string) {
    const page = await this.prisma.businessPage.findFirst({ where: { id, ownerId: userId } });
    if (!page) throw Errors.notFound('Page');
    return page;
  }

  async get(viewerId: string, ref: string): Promise<PageView> {
    const page = await this.findVisible(viewerId, ref);
    return (await this.viewMany(viewerId, [page]))[0] as PageView;
  }

  async mine(userId: string): Promise<PageView[]> {
    const rows = await this.prisma.businessPage.findMany({
      where: { ownerId: userId },
      include: pageInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return this.viewMany(userId, rows);
  }

  // ----------------------------------------------------------------- creating --

  private async screen(issues: FieldIssue[], fields: Record<string, string | null | undefined>) {
    const blocked = await this.settings.get<string[]>(BLOCKED_TERMS_SETTING, []);
    for (const [field, text] of Object.entries(fields)) {
      if (text && !screenText(text, blocked).clean)
        issues.push({ field, reasons: ['not_allowed'] });
    }
  }

  private clean(input: PageInput, issues: FieldIssue[]): PageInput {
    const out: PageInput = {};
    if (input.name !== undefined) {
      const name = input.name.replace(/\s+/g, ' ').trim();
      if (name.length < 2 || name.length > 120)
        issues.push({ field: 'name', reasons: ['length_2_to_120'] });
      out.name = name;
    }
    if (input.category !== undefined) {
      if (!(BUSINESS_CATEGORIES as readonly string[]).includes(input.category))
        issues.push({ field: 'category', reasons: ['unknown_category'] });
      out.category = input.category;
    }
    if (input.description !== undefined) {
      out.description = input.description === null ? null : input.description.trim() || null;
    }
    if (input.contactEmail !== undefined) {
      const email =
        input.contactEmail === null ? null : input.contactEmail.trim().toLowerCase() || null;
      if (email && !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email))
        issues.push({ field: 'contactEmail', reasons: ['invalid'] });
      out.contactEmail = email;
    }
    if (input.websiteUrl !== undefined) {
      if (input.websiteUrl === null || input.websiteUrl.trim() === '') out.websiteUrl = null;
      else {
        const safe = safeWebUrl(input.websiteUrl);
        if (!safe || safe.length > 200)
          issues.push({ field: 'websiteUrl', reasons: ['must_be_a_public_https_address'] });
        out.websiteUrl = safe;
      }
    }
    for (const f of ['state', 'district', 'city'] as const) {
      if (input[f] !== undefined)
        out[f] = input[f] === null ? null : (input[f] as string).trim().slice(0, 80) || null;
    }
    return out;
  }

  /** An address that is free: the one asked for, or one made from the name with a number added if taken. */
  private async freeSlug(requested: string | undefined, name: string): Promise<string> {
    if (requested !== undefined) {
      const problem = slugProblem(requested);
      if (problem) throw Errors.validation([{ field: 'slug', reasons: [problem] }]);
      if (
        await this.prisma.businessPage.findUnique({
          where: { slug: requested },
          select: { id: true },
        })
      )
        throw Errors.conflict('That page address is taken.', 'CONFLICT', { field: 'slug' });
      return requested;
    }
    const base = slugify(name);
    if (slugProblem(base) === 'invalid' || slugProblem(base) === 'reserved') {
      throw Errors.validation([{ field: 'slug', reasons: ['choose_an_address'] }]);
    }
    for (let i = 0; i < 20; i++) {
      const candidate = i === 0 ? base : `${base.slice(0, 40 - String(i + 1).length - 1)}-${i + 1}`;
      if (slugProblem(candidate)) continue;
      if (
        !(await this.prisma.businessPage.findUnique({
          where: { slug: candidate },
          select: { id: true },
        }))
      )
        return candidate;
    }
    throw Errors.conflict('Could not find a free page address. Choose one.');
  }

  async create(
    userId: string,
    input: PageInput & { name: string; category: string },
  ): Promise<PageView> {
    const issues: FieldIssue[] = [];
    const data = this.clean(input, issues);
    await this.screen(issues, { name: data.name, description: data.description });
    if (issues.length) throw Errors.validation(issues);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, emailVerifiedAt: true, phoneVerifiedAt: true },
    });
    if (user.status !== 'ACTIVE')
      throw Errors.forbidden('This account cannot create pages right now.');
    if (!user.emailVerifiedAt && !user.phoneVerifiedAt)
      throw Errors.precondition('Verify your e-mail or phone number before creating a page.');
    const max = await this.settings.get<number>(MAX_PAGES_SETTING, DEFAULT_MAX_PAGES);
    if ((await this.prisma.businessPage.count({ where: { ownerId: userId } })) >= max)
      throw Errors.conflict(`You can have up to ${max} pages.`);

    const slug = await this.freeSlug(input.slug, data.name as string);
    const assets = await this.attachments(userId, input);
    try {
      const page = await this.prisma.businessPage.create({
        data: {
          ownerId: userId,
          slug,
          name: data.name as string,
          category: data.category as string,
          description: data.description ?? null,
          contactEmail: data.contactEmail ?? null,
          websiteUrl: data.websiteUrl ?? null,
          state: data.state ?? null,
          district: data.district ?? null,
          city: data.city ?? null,
          ...assets,
        },
        include: pageInclude,
      });
      return this.view(page, userId, false);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002')
        throw Errors.conflict('That page address is taken.', 'CONFLICT', { field: 'slug' });
      throw e;
    }
  }

  /** Images must be the owner's own finished business pictures. */
  private async attachments(userId: string, input: PageInput) {
    const out: { avatarMediaId?: string | null; coverMediaId?: string | null } = {};
    const issues: FieldIssue[] = [];
    for (const [field, key] of [
      ['avatarMediaId', 'avatarMediaId'],
      ['coverMediaId', 'coverMediaId'],
    ] as const) {
      const id = input[field];
      if (id === undefined) continue;
      if (id === null) {
        out[key] = null;
        continue;
      }
      const asset = await this.prisma.mediaAsset.findFirst({
        where: {
          id,
          ownerId: userId,
          kind: 'IMAGE',
          purpose: 'BUSINESS_IMAGE',
          status: 'READY',
          moderationStatus: { in: ['APPROVED', 'PENDING'] },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!asset) issues.push({ field, reasons: ['not_available'] });
      else out[key] = asset.id;
    }
    if (issues.length) throw Errors.validation(issues);
    return out;
  }

  // ------------------------------------------------------------------ changing --

  async update(
    userId: string,
    id: string,
    input: PageInput,
  ): Promise<PageView & { verificationReset?: true }> {
    const page = await this.findOwned(userId, id);
    if (page.status === 'SUSPENDED')
      throw Errors.forbidden('This page was suspended. Contact support.');
    const issues: FieldIssue[] = [];
    const data = this.clean(input, issues);
    await this.screen(issues, { name: data.name, description: data.description });
    if (input.slug !== undefined && input.slug !== page.slug) {
      if (page.status !== 'DRAFT') issues.push({ field: 'slug', reasons: ['only_while_a_draft'] });
      else {
        const problem = slugProblem(input.slug);
        if (problem) issues.push({ field: 'slug', reasons: [problem] });
      }
    }
    if (issues.length) throw Errors.validation(issues);
    const assets = await this.attachments(userId, input);

    const nameChanged = data.name !== undefined && data.name !== page.name;
    const categoryChanged = data.category !== undefined && data.category !== page.category;
    const resets = page.verificationStatus === 'APPROVED' && (nameChanged || categoryChanged);
    if (input.slug !== undefined && input.slug !== page.slug) {
      if (
        await this.prisma.businessPage.findUnique({
          where: { slug: input.slug },
          select: { id: true },
        })
      )
        throw Errors.conflict('That page address is taken.', 'CONFLICT', { field: 'slug' });
    }
    try {
      const updated = await this.prisma.businessPage.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.category !== undefined ? { category: data.category } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.contactEmail !== undefined ? { contactEmail: data.contactEmail } : {}),
          ...(data.websiteUrl !== undefined ? { websiteUrl: data.websiteUrl } : {}),
          ...(data.state !== undefined ? { state: data.state } : {}),
          ...(data.district !== undefined ? { district: data.district } : {}),
          ...(data.city !== undefined ? { city: data.city } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...assets,
          ...(resets ? { verificationStatus: 'NONE' as const } : {}),
        },
        include: pageInclude,
      });
      const view = this.view(updated, userId, false);
      return resets ? { ...view, verificationReset: true } : view;
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002')
        throw Errors.conflict('That page address is taken.', 'CONFLICT', { field: 'slug' });
      throw e;
    }
  }

  /** Makes a draft public, once it has what a visitor needs to make sense of it. */
  async publish(userId: string, id: string): Promise<PageView> {
    const page = await this.findOwned(userId, id);
    if (page.status === 'SUSPENDED')
      throw Errors.forbidden('This page was suspended. Contact support.');
    if (page.status === 'ACTIVE') return this.get(userId, id);
    const issues: FieldIssue[] = [];
    if (!page.description || page.description.length < 20)
      issues.push({ field: 'description', reasons: ['at_least_20_characters_to_publish'] });
    if (!page.state) issues.push({ field: 'state', reasons: ['required_to_publish'] });
    if (!page.contactEmail && !page.websiteUrl)
      issues.push({
        field: 'contactEmail',
        reasons: ['an_email_or_website_is_required_to_publish'],
      });
    if (issues.length) throw Errors.validation(issues);
    await this.prisma.businessPage.update({
      where: { id },
      data: { status: 'ACTIVE', statusReason: null, statusChangedAt: new Date() },
    });
    return this.get(userId, id);
  }

  async unpublish(userId: string, id: string): Promise<PageView> {
    const page = await this.findOwned(userId, id);
    if (page.status === 'SUSPENDED')
      throw Errors.forbidden('This page was suspended. Contact support.');
    if (page.status === 'DRAFT') return this.get(userId, id);
    const live = await this.prisma.adCampaign.count({
      where: {
        businessPageId: id,
        status: { in: ['IN_REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED'] },
      },
    });
    if (live > 0) throw Errors.conflict('Stop or cancel its advertising campaigns first.');
    await this.prisma.businessPage.update({
      where: { id },
      data: { status: 'DRAFT', statusChangedAt: new Date() },
    });
    return this.get(userId, id);
  }

  // ------------------------------------------------------------------ following --

  async follow(userId: string, ref: string): Promise<{ following: true; followers: number }> {
    const page = await this.findVisible(userId, ref);
    if (page.ownerId === userId)
      throw Errors.validation([{ field: 'page', reasons: ['cannot_follow_your_own_page'] }]);
    const followers = await this.prisma.$transaction(async (tx) => {
      const made = await tx.businessFollow.createMany({
        data: [{ pageId: page.id, userId }],
        skipDuplicates: true,
      });
      if (made.count === 1) {
        return (
          await tx.businessPage.update({
            where: { id: page.id },
            data: { followersCount: { increment: 1 } },
            select: { followersCount: true },
          })
        ).followersCount;
      }
      return (
        await tx.businessPage.findUniqueOrThrow({
          where: { id: page.id },
          select: { followersCount: true },
        })
      ).followersCount;
    });
    return { following: true, followers };
  }

  async unfollow(userId: string, ref: string): Promise<{ following: false; followers: number }> {
    const page = await this.prisma.businessPage.findFirst({
      where: isUuid(ref) ? { id: ref } : { slug: ref.toLowerCase() },
      select: { id: true },
    });
    if (!page) return { following: false, followers: 0 };
    const followers = await this.prisma.$transaction(async (tx) => {
      const gone = await tx.businessFollow.deleteMany({ where: { pageId: page.id, userId } });
      if (gone.count === 1) {
        return (
          await tx.businessPage.update({
            where: { id: page.id },
            data: { followersCount: { increment: -1 } },
            select: { followersCount: true },
          })
        ).followersCount;
      }
      return (
        await tx.businessPage.findUniqueOrThrow({
          where: { id: page.id },
          select: { followersCount: true },
        })
      ).followersCount;
    });
    return { following: false, followers };
  }

  // --------------------------------------------------------------------- offers --

  async offers(viewerId: string, ref: string) {
    const page = await this.findVisible(viewerId, ref);
    const now = new Date();
    const rows = await this.prisma.businessOffer.findMany({
      where: {
        pageId: page.id,
        // The owner sees expired ones too, to tidy them; everyone else sees what is on now.
        ...(page.ownerId === viewerId
          ? {}
          : {
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_OFFERS * 2,
    });
    return rows.map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      startsAt: o.startsAt?.toISOString() ?? null,
      endsAt: o.endsAt?.toISOString() ?? null,
      expired: !!o.endsAt && o.endsAt <= now,
    }));
  }

  async addOffer(
    userId: string,
    id: string,
    input: {
      title: string;
      description?: string | undefined;
      startsAt?: string | undefined;
      endsAt?: string | undefined;
    },
  ) {
    const page = await this.findOwned(userId, id);
    if (page.status === 'SUSPENDED')
      throw Errors.forbidden('This page was suspended. Contact support.');
    const issues: FieldIssue[] = [];
    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (startsAt && Number.isNaN(startsAt.getTime()))
      issues.push({ field: 'startsAt', reasons: ['invalid'] });
    if (endsAt && Number.isNaN(endsAt.getTime()))
      issues.push({ field: 'endsAt', reasons: ['invalid'] });
    if (startsAt && endsAt && endsAt <= startsAt)
      issues.push({ field: 'endsAt', reasons: ['must_be_after_start'] });
    if (endsAt && endsAt <= new Date())
      issues.push({ field: 'endsAt', reasons: ['must_be_in_the_future'] });
    await this.screen(issues, { title: input.title, description: input.description });
    if (issues.length) throw Errors.validation(issues);
    const open = await this.prisma.businessOffer.count({
      where: { pageId: id, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
    });
    if (open >= MAX_OFFERS)
      throw Errors.conflict(`A page can have up to ${MAX_OFFERS} offers at a time.`);
    const created = await this.prisma.businessOffer.create({
      data: {
        pageId: id,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        startsAt,
        endsAt,
      },
    });
    return {
      id: created.id,
      title: created.title,
      description: created.description,
      startsAt: created.startsAt?.toISOString() ?? null,
      endsAt: created.endsAt?.toISOString() ?? null,
      expired: false,
    };
  }

  async removeOffer(userId: string, id: string, offerId: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.prisma.businessOffer.deleteMany({ where: { id: offerId, pageId: id } });
  }

  // ---------------------------------------------------------------------- posts --

  /** What the page has published, as the viewer is allowed to see it. */
  async postsOf(
    viewerId: string,
    ref: string,
    q: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    const page = await this.findVisible(viewerId, ref);
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows: PostRow[] = await this.prisma.post.findMany({
      where: {
        AND: [
          { businessPageId: page.id },
          postVisibleTo(viewerId),
          ...(after
            ? [
                {
                  OR: [
                    { publishedAt: { lt: new Date(after.t) } },
                    { publishedAt: new Date(after.t), id: { lt: after.id } },
                  ],
                } satisfies Prisma.PostWhereInput,
              ]
            : []),
        ],
      },
      include: postInclude,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const views = await this.posts.hydrate(viewerId, rows.slice(0, limit));
    const byId = new Map(views.map((v) => [v.id, v]));
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.publishedAt.toISOString(), id: r.id }),
      (r) => byId.get(r.id) as PostView,
    );
  }

  // ------------------------------------------------------------------ analytics --

  /**
   * How the page is doing, for its owner only: numbers, never people. Engagement is summed over the
   * posts published in the window, so it answers "how did what we posted do", and followers are
   * counted by the day they arrived.
   */
  async analytics(userId: string, id: string, days: number) {
    const page = await this.findOwned(userId, id);
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    const [totals, byLevel, followerRows, campaigns, gained] = await Promise.all([
      this.prisma.post.aggregate({
        where: {
          businessPageId: id,
          deletedAt: null,
          moderationStatus: 'APPROVED',
          publishedAt: { gte: from },
        },
        _count: { _all: true },
        _sum: {
          likesCount: true,
          commentsCount: true,
          sharesCount: true,
          savesCount: true,
          viewsCount: true,
        },
      }),
      this.prisma.post.groupBy({
        by: ['reachLevel'],
        where: {
          businessPageId: id,
          deletedAt: null,
          moderationStatus: 'APPROVED',
          publishedAt: { gte: from },
        },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ day: Date; n: bigint }>>`
        SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n
          FROM business_follows
         WHERE page_id = ${id}::uuid AND created_at >= ${from}
         GROUP BY 1 ORDER BY 1`,
      this.prisma.adCampaign.groupBy({
        by: ['status'],
        where: { businessPageId: id },
        _count: { _all: true },
      }),
      this.prisma.businessFollow.count({ where: { pageId: id, createdAt: { gte: from } } }),
    ]);
    const perDay = new Map(
      followerRows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.n)]),
    );
    const series = Array.from({ length: days }, (_, i) => {
      const day = new Date(to.getTime() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
      return { day, count: perDay.get(day) ?? 0 };
    });
    const level = (l: string) => byLevel.find((b) => b.reachLevel === l)?._count._all ?? 0;
    return {
      window: { days, from: from.toISOString(), to: to.toISOString() },
      followers: { total: page.followersCount, gained, perDay: series },
      posts: {
        published: totals._count._all,
        byReach: {
          DISTRICT: level('DISTRICT'),
          STATE: level('STATE'),
          NATIONAL: level('NATIONAL'),
          GLOBAL: level('GLOBAL'),
        },
      },
      engagement: {
        likes: totals._sum.likesCount ?? 0,
        comments: totals._sum.commentsCount ?? 0,
        shares: totals._sum.sharesCount ?? 0,
        saves: totals._sum.savesCount ?? 0,
        views: totals._sum.viewsCount ?? 0,
      },
      campaigns: Object.fromEntries(campaigns.map((c) => [c.status, c._count._all])),
    };
  }
}
