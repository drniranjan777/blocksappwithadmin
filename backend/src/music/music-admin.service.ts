import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../admin/audit/audit.service.js';
import { Errors } from '../common/errors/app-error.js';
import type { AdminAuthContext } from '../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../common/pagination/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import type { MusicRightsType, MusicStatus, MusicUse, Prisma } from '../generated/prisma/client.js';
import { MediaViews } from '../social/shared/media-views.js';
import { cleanLine } from '../social/shared/text.js';
import type {
  CompleteAudioDto,
  CreateLicenceDto,
  CreateTrackDto,
  FileUploadDto,
  UpdateTrackDto,
} from './dto/music.dto.js';
import { MusicAssetsService } from './music-assets.service.js';
import { PERPETUAL, checkAvailability } from './music-availability.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const NEEDS_LICENCE: ReadonlySet<MusicRightsType> = new Set(['LICENSED', 'RESTRICTED']);

type TrackRow = Prisma.MusicTrackGetPayload<object>;
type LicenceRow = Prisma.MusicLicenceGetPayload<{
  include: { createdBy: { select: { name: true } } };
}>;

const upper = (list: readonly string[]) => [...new Set(list.map((c) => c.toUpperCase()))].sort();

/**
 * Running the music library: what is in it, what it may be used for, and the licences
 * that make that lawful.
 *
 * The rules that matter:
 *
 *   - **Two people.** `music.manage` decides what is *offered* (metadata, countries,
 *     uses, going live). `music.licences.manage` records what is *permitted* (licences,
 *     and the rights type of a track). The permission catalogue forbids one role holding
 *     both, so nobody can both record a licence and put the music live under it.
 *   - A track whose rights depend on someone else's licence cannot go live without a
 *     running licence covering every country it is offered in, and drops off the moment
 *     the last licence is revoked or ends.
 *   - Audio cannot be swapped on a live track (suspend it first), so what was reviewed
 *     is what is playing.
 *   - Every change is audited in the same transaction, with a reason where it widens
 *     what people can play.
 */
@Injectable()
export class MusicAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assets: MusicAssetsService,
    private readonly media: MediaViews,
  ) {}

  // ------------------------------------------------------------------ views --

  private trackView(t: TrackRow) {
    return {
      id: t.id,
      title: t.title,
      artist: t.artist,
      language: t.language,
      genre: t.genre || null,
      durationMs: t.durationMs,
      categories: t.categories,
      status: t.status,
      rightsType: t.rightsType,
      allowedCountries: t.allowedCountries,
      allowedUses: t.allowedUses,
      licenceExpiresAt: t.licenceExpiresAt ? this.licenceEnd(t.licenceExpiresAt) : null,
      hasAudio: !!t.audioKey,
      coverUrl: this.media.link(t.coverKey),
      previewUrl: this.media.link(t.previewKey),
      reelsCount: t.reelsCount,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  /** A licence that never ends is stored as year 9999; staff see it as such. */
  private licenceEnd(d: Date): string | 'perpetual' {
    return d.getTime() >= PERPETUAL.getTime() ? 'perpetual' : d.toISOString();
  }

  private licenceView(l: LicenceRow) {
    return {
      id: l.id,
      trackId: l.trackId,
      licensor: l.licensor,
      reference: l.reference,
      rightsType: l.rightsType,
      territories: l.territories,
      status: l.status,
      startsAt: l.startsAt.toISOString(),
      expiresAt: l.expiresAt?.toISOString() ?? null,
      restrictionsNote:
        l.restrictions && typeof l.restrictions === 'object' && 'note' in l.restrictions
          ? String((l.restrictions as { note: unknown }).note)
          : null,
      hasDocument: !!l.documentKey,
      createdBy: l.createdBy.name,
      createdAt: l.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------- reading --

  async list(q: {
    status?: MusicStatus | undefined;
    q?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.musicTrack.findMany({
      where: {
        AND: [
          ...(q.status ? [{ status: q.status }] : []),
          ...(q.q
            ? [
                {
                  OR: [
                    { title: { contains: q.q, mode: 'insensitive' as const } },
                    { artist: { contains: q.q, mode: 'insensitive' as const } },
                  ],
                },
              ]
            : []),
          ...(after
            ? [
                {
                  OR: [
                    { createdAt: { lt: new Date(after.t) } },
                    { createdAt: new Date(after.t), id: { lt: after.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => this.trackView(r),
    );
  }

  private async track(id: string): Promise<TrackRow> {
    const t = await this.prisma.musicTrack.findUnique({ where: { id } });
    if (!t) throw Errors.notFound('Track');
    return t;
  }

  async get(id: string) {
    return this.trackView(await this.track(id));
  }

  async licences(trackId: string) {
    await this.track(trackId);
    const rows = await this.prisma.musicLicence.findMany({
      where: { trackId },
      include: { createdBy: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((l) => this.licenceView(l));
  }

  // ----------------------------------------------------------------- tracks --

  async create(actor: AdminAuthContext, dto: CreateTrackDto, meta: Meta) {
    const data = {
      title: cleanLine(dto.title),
      artist: cleanLine(dto.artist),
      language: cleanLine(dto.language),
      genre: cleanLine(dto.genre ?? ''),
      categories: dto.categories ?? [],
    };
    if (!data.title || !data.artist || data.language.length < 2) {
      throw Errors.validation([{ field: 'title', reasons: ['required'] }]);
    }
    return this.prisma.$transaction(async (tx) => {
      // New music starts as *licensed from someone else*, the strictest case: it cannot go
      // live until a licence is recorded, or the licensing team says the platform owns it.
      const t = await tx.musicTrack.create({
        data: { ...data, durationMs: 0, rightsType: 'LICENSED', status: 'DRAFT' },
      });
      await this.audit.record(
        {
          ...this.actor(actor, meta),
          action: 'music.track_created',
          targetType: 'music_track',
          targetId: t.id,
          after: data,
        },
        tx,
      );
      return this.trackView(t);
    });
  }

  async update(actor: AdminAuthContext, id: string, dto: UpdateTrackDto, meta: Meta) {
    const widens = dto.allowedCountries !== undefined || dto.allowedUses !== undefined;
    if (widens && !dto.reason) {
      throw Errors.validation([{ field: 'reason', reasons: ['required'] }]);
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.musicTrack.findUnique({ where: { id } });
      if (!before) throw Errors.notFound('Track');
      const data: Prisma.MusicTrackUpdateInput = {};
      if (dto.title !== undefined) data.title = cleanLine(dto.title);
      if (dto.artist !== undefined) data.artist = cleanLine(dto.artist);
      if (dto.language !== undefined) data.language = cleanLine(dto.language);
      if (dto.genre !== undefined) data.genre = cleanLine(dto.genre);
      if (dto.categories !== undefined) data.categories = dto.categories;
      if (dto.allowedUses !== undefined) data.allowedUses = [...new Set(dto.allowedUses)];
      if (dto.allowedCountries !== undefined) {
        const countries = upper(dto.allowedCountries);
        if (NEEDS_LICENCE.has(before.rightsType)) await this.assertCovered(tx, id, countries);
        data.allowedCountries = countries;
      }
      if (
        data.title === '' ||
        data.artist === '' ||
        (typeof data.language === 'string' && data.language.length < 2)
      ) {
        throw Errors.validation([{ field: 'title', reasons: ['required'] }]);
      }
      // A live track must stay offerable: emptying its countries or uses would hide it silently.
      // Checked before writing, so the refusal is a clear message and not a database error.
      const countries = (data.allowedCountries as string[] | undefined) ?? before.allowedCountries;
      const uses = (data.allowedUses as MusicUse[] | undefined) ?? before.allowedUses;
      if (before.status === 'ACTIVE' && (countries.length === 0 || uses.length === 0)) {
        throw Errors.conflict(
          'A live track needs at least one country and one use. Suspend it instead.',
        );
      }
      const after = await tx.musicTrack.update({ where: { id }, data });
      await this.audit.record(
        {
          ...this.actor(actor, meta),
          action: 'music.track_updated',
          targetType: 'music_track',
          targetId: id,
          reason: dto.reason,
          before: this.changed(before, after),
          after: this.changed(after, before),
        },
        tx,
      );
      return this.trackView(after);
    });
  }

  /** Only the fields of `a` that differ from `b`, for the audit record. */
  private changed(a: TrackRow, b: TrackRow): Record<string, unknown> {
    const keys = [
      'title',
      'artist',
      'language',
      'genre',
      'categories',
      'allowedCountries',
      'allowedUses',
    ] as const;
    return Object.fromEntries(
      keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => [k, a[k]]),
    );
  }

  /** Setting the rights type is a licensing decision, so it belongs to the licensing permission. */
  async setRights(
    actor: AdminAuthContext,
    id: string,
    rightsType: MusicRightsType,
    reason: string,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.musicTrack.findUnique({ where: { id } });
      if (!before) throw Errors.notFound('Track');
      if (before.rightsType === rightsType) return this.trackView(before);
      let status = before.status;
      // Restricted music is never offered. Moving to rights that need a licence takes a live
      // track down until one is in place.
      if (status === 'ACTIVE') {
        if (rightsType === 'RESTRICTED') status = 'SUSPENDED';
        else if (NEEDS_LICENCE.has(rightsType)) {
          const expiry = await this.licenceExpiry(tx, id);
          if (!expiry || expiry <= new Date()) status = 'SUSPENDED';
        }
      }
      const after = await tx.musicTrack.update({ where: { id }, data: { rightsType, status } });
      await this.audit.record(
        {
          ...this.actor(actor, meta),
          action: 'music.rights_changed',
          targetType: 'music_track',
          targetId: id,
          reason,
          before: { rightsType: before.rightsType, status: before.status },
          after: { rightsType, status },
        },
        tx,
      );
      return this.trackView(after);
    });
  }

  // ------------------------------------------------------------------ files --

  private async assertEditable(id: string): Promise<TrackRow> {
    const t = await this.track(id);
    if (t.status === 'ACTIVE')
      throw Errors.conflict('Suspend this track before replacing its files.');
    return t;
  }

  async presign(id: string, part: 'audio' | 'cover', dto: FileUploadDto) {
    await this.assertEditable(id);
    const request = await this.assets.presign(id, part, dto.contentType, dto.sizeBytes);
    return { upload: request };
  }

  async completeAudio(actor: AdminAuthContext, id: string, dto: CompleteAudioDto, meta: Meta) {
    await this.assertEditable(id);
    const made = await this.assets.processAudio(id, dto.previewStartSeconds ?? 0);
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.musicTrack.update({ where: { id }, data: made });
      await this.audit.record(
        {
          ...this.actor(actor, meta),
          action: 'music.audio_uploaded',
          targetType: 'music_track',
          targetId: id,
          after: { durationMs: made.durationMs },
        },
        tx,
      );
      return this.trackView(t);
    });
  }

  async completeCover(actor: AdminAuthContext, id: string, meta: Meta) {
    await this.assertEditable(id);
    const made = await this.assets.processCover(id);
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.musicTrack.update({ where: { id }, data: made });
      await this.audit.record(
        {
          ...this.actor(actor, meta),
          action: 'music.cover_uploaded',
          targetType: 'music_track',
          targetId: id,
        },
        tx,
      );
      return this.trackView(t);
    });
  }

  // ------------------------------------------------------------- availability --

  /** Is the track ready to be offered? Throws, saying what is missing. */
  private assertOfferable(t: TrackRow, licenceExpiresAt: Date | null): void {
    if (!t.audioKey || !t.previewKey || t.durationMs <= 0)
      throw Errors.conflict('Upload the audio before making this track available.');
    if (t.rightsType === 'RESTRICTED')
      throw Errors.conflict('Restricted music cannot be made available.');
    if (t.allowedCountries.length === 0)
      throw Errors.conflict('Choose at least one country first.');
    if (t.allowedUses.length === 0) throw Errors.conflict('Choose at least one use first.');
    const result = checkAvailability(
      { ...t, status: 'ACTIVE', licenceExpiresAt },
      { country: t.allowedCountries[0] as string, use: t.allowedUses[0] as MusicUse },
    );
    if (!result.ok) {
      throw Errors.conflict(
        'This track needs a running licence before it can be made available.',
        'CONFLICT',
        { reason: result.reason },
      );
    }
  }

  private async move(
    actor: AdminAuthContext,
    id: string,
    from: MusicStatus[],
    to: MusicStatus,
    action: string,
    reason: string,
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.musicTrack.findUnique({ where: { id } });
      if (!t) throw Errors.notFound('Track');
      if (!from.includes(t.status))
        throw Errors.conflict(`A track that is ${t.status.toLowerCase()} cannot do that.`);
      let licenceExpiresAt = t.licenceExpiresAt;
      if (to === 'ACTIVE') {
        licenceExpiresAt = await this.licenceExpiry(tx, id);
        this.assertOfferable(t, licenceExpiresAt);
        if (NEEDS_LICENCE.has(t.rightsType)) await this.assertCovered(tx, id, t.allowedCountries);
      }
      // Guarded by the status we read, so two staff members cannot both act on the same state.
      const { count } = await tx.musicTrack.updateMany({
        where: { id, status: t.status },
        data: { status: to, licenceExpiresAt },
      });
      if (count !== 1)
        throw Errors.conflict('This track was changed by someone else. Reload and try again.');
      await this.audit.record(
        {
          ...this.actor(actor, meta),
          action,
          targetType: 'music_track',
          targetId: id,
          reason,
          before: { status: t.status },
          after: { status: to },
        },
        tx,
      );
      return this.trackView({ ...t, status: to, licenceExpiresAt });
    });
  }

  activate(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    return this.move(actor, id, ['DRAFT'], 'ACTIVE', 'music.track_activated', reason, meta);
  }

  suspend(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    return this.move(actor, id, ['ACTIVE'], 'SUSPENDED', 'music.track_suspended', reason, meta);
  }

  restore(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    return this.move(
      actor,
      id,
      ['SUSPENDED', 'EXPIRED'],
      'ACTIVE',
      'music.track_restored',
      reason,
      meta,
    );
  }

  // --------------------------------------------------------------- licences --

  /** When the licences that are running now end (`PERPETUAL` if one never does), or `null` if none is. */
  private async licenceExpiry(
    tx: Prisma.TransactionClient,
    trackId: string,
    now = new Date(),
  ): Promise<Date | null> {
    const running = await tx.musicLicence.findMany({
      where: {
        trackId,
        status: 'ACTIVE',
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { expiresAt: true },
    });
    if (running.length === 0) return null;
    if (running.some((l) => !l.expiresAt)) return PERPETUAL;
    return new Date(Math.max(...running.map((l) => (l.expiresAt as Date).getTime())));
  }

  /** Every country in `countries` must be inside a running licence. */
  private async assertCovered(
    tx: Prisma.TransactionClient,
    trackId: string,
    countries: readonly string[],
  ): Promise<void> {
    if (countries.length === 0) return;
    const now = new Date();
    const running = await tx.musicLicence.findMany({
      where: {
        trackId,
        status: 'ACTIVE',
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { territories: true },
    });
    const covered = new Set(running.flatMap((l) => l.territories.map((c) => c.toUpperCase())));
    const worldwide = covered.has('WW');
    const missing = countries.filter((c) => !worldwide && !covered.has(c.toUpperCase()));
    if (missing.length > 0) {
      throw Errors.conflict('A running licence does not cover every country chosen.', 'CONFLICT', {
        notCovered: missing,
      });
    }
  }

  /** Brings a track in line with its licences; takes it off sale if none is running. */
  private async reconcile(
    tx: Prisma.TransactionClient,
    trackId: string,
    lapse: 'SUSPENDED' | 'EXPIRED',
  ): Promise<void> {
    const t = await tx.musicTrack.findUnique({ where: { id: trackId } });
    if (!t) return;
    const expiry = await this.licenceExpiry(tx, trackId);
    const lapsed = NEEDS_LICENCE.has(t.rightsType) && !expiry;
    await tx.musicTrack.update({
      where: { id: trackId },
      data: {
        licenceExpiresAt: expiry,
        ...(lapsed && t.status === 'ACTIVE' ? { status: lapse } : {}),
      },
    });
  }

  async createLicence(actor: AdminAuthContext, trackId: string, dto: CreateLicenceDto, meta: Meta) {
    const startsAt = new Date(dto.startsAt);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= startsAt) {
      throw Errors.validation([{ field: 'expiresAt', reasons: ['before_start'] }]);
    }
    if (expiresAt && expiresAt >= PERPETUAL) {
      throw Errors.validation([{ field: 'expiresAt', reasons: ['too_far'] }]);
    }
    await this.track(trackId);
    return this.prisma.$transaction(async (tx) => {
      const l = await tx.musicLicence.create({
        data: {
          trackId,
          licensor: cleanLine(dto.licensor),
          reference: cleanLine(dto.reference),
          rightsType: dto.rightsType,
          territories: upper(dto.territories),
          startsAt,
          expiresAt,
          ...(dto.restrictionsNote
            ? { restrictions: { note: cleanLine(dto.restrictionsNote) } }
            : {}),
          createdById: actor.adminId,
        },
        include: { createdBy: { select: { name: true } } },
      });
      await this.audit.record(
        {
          ...this.actor(actor, meta),
          action: 'music.licence_created',
          targetType: 'music_licence',
          targetId: l.id,
          after: {
            trackId,
            licensor: l.licensor,
            reference: l.reference,
            territories: l.territories,
            startsAt,
            expiresAt,
          },
        },
        tx,
      );
      return this.licenceView(l);
    });
  }

  private async licence(id: string): Promise<LicenceRow> {
    const l = await this.prisma.musicLicence.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true } } },
    });
    if (!l) throw Errors.notFound('Licence');
    return l;
  }

  async activateLicence(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    return this.prisma.$transaction(async (tx) => {
      const l = await tx.musicLicence.findUnique({
        where: { id },
        include: { createdBy: { select: { name: true } } },
      });
      if (!l) throw Errors.notFound('Licence');
      if (l.status !== 'PENDING')
        throw Errors.conflict(`A licence that is ${l.status.toLowerCase()} cannot be activated.`);
      const now = new Date();
      if (l.startsAt > now)
        throw Errors.conflict(
          'This licence has not started yet. Activate it on or after its start date.',
        );
      if (l.expiresAt && l.expiresAt <= now)
        throw Errors.conflict('This licence has already ended.');
      const { count } = await tx.musicLicence.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'ACTIVE' },
      });
      if (count !== 1)
        throw Errors.conflict('This licence was changed by someone else. Reload and try again.');
      await this.reconcile(tx, l.trackId, 'SUSPENDED');
      await this.audit.record(
        {
          ...this.actor(actor, meta),
          action: 'music.licence_activated',
          targetType: 'music_licence',
          targetId: id,
          reason,
          before: { status: 'PENDING' },
          after: { status: 'ACTIVE' },
        },
        tx,
      );
      return this.licenceView({ ...l, status: 'ACTIVE' });
    });
  }

  async revokeLicence(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    return this.prisma.$transaction(async (tx) => {
      const l = await tx.musicLicence.findUnique({
        where: { id },
        include: { createdBy: { select: { name: true } } },
      });
      if (!l) throw Errors.notFound('Licence');
      if (l.status !== 'ACTIVE' && l.status !== 'PENDING') {
        throw Errors.conflict(`A licence that is ${l.status.toLowerCase()} cannot be revoked.`);
      }
      const { count } = await tx.musicLicence.updateMany({
        where: { id, status: l.status },
        data: { status: 'REVOKED' },
      });
      if (count !== 1)
        throw Errors.conflict('This licence was changed by someone else. Reload and try again.');
      await this.reconcile(tx, l.trackId, 'SUSPENDED');
      await this.audit.record(
        {
          ...this.actor(actor, meta),
          action: 'music.licence_revoked',
          targetType: 'music_licence',
          targetId: id,
          reason,
          before: { status: l.status },
          after: { status: 'REVOKED' },
        },
        tx,
      );
      return this.licenceView({ ...l, status: 'REVOKED' });
    });
  }

  async presignDocument(id: string, dto: FileUploadDto) {
    await this.licence(id);
    return { upload: await this.assets.presignDocument(id, dto.contentType, dto.sizeBytes) };
  }

  async completeDocument(actor: AdminAuthContext, id: string, meta: Meta) {
    await this.licence(id);
    const { documentKey } = await this.assets.acceptDocument(id);
    return this.prisma.$transaction(async (tx) => {
      const l = await tx.musicLicence.update({
        where: { id },
        data: { documentKey },
        include: { createdBy: { select: { name: true } } },
      });
      await this.audit.record(
        {
          ...this.actor(actor, meta),
          action: 'music.licence_document_added',
          targetType: 'music_licence',
          targetId: id,
        },
        tx,
      );
      return this.licenceView(l);
    });
  }

  /** A short-lived address for the signed licence. Reading it is itself recorded. */
  async viewDocument(actor: AdminAuthContext, id: string, meta: Meta) {
    const l = await this.licence(id);
    if (!l.documentKey) throw Errors.notFound('Licence document');
    await this.audit.record({
      ...this.actor(actor, meta),
      action: 'music.licence_document_viewed',
      targetType: 'music_licence',
      targetId: id,
      sensitive: true,
    });
    return { url: await this.assets.documentUrl(l.documentKey), expiresInSeconds: 120 };
  }

  // --------------------------------------------------------------------- job --

  /** Ends licences whose time has passed and takes their tracks off sale. Safe to run often. */
  async expireLicences(now = new Date()): Promise<number> {
    const due = await this.prisma.musicLicence.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      select: { id: true, trackId: true },
      take: 200,
    });
    for (const l of due) {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.musicLicence.updateMany({
          where: { id: l.id, status: 'ACTIVE' },
          data: { status: 'EXPIRED' },
        });
        if (count !== 1) return;
        await this.reconcile(tx, l.trackId, 'EXPIRED');
        await this.audit.record(
          {
            actorType: 'SYSTEM',
            actorLabel: 'licence-expiry',
            action: 'music.licence_expired',
            targetType: 'music_licence',
            targetId: l.id,
          },
          tx,
        );
      });
    }
    return due.length;
  }

  private actor(actor: AdminAuthContext, meta: Meta) {
    return { actorType: 'ADMIN' as const, actorId: actor.adminId, actorLabel: actor.name, ...meta };
  }
}
