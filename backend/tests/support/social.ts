import { randomUUID } from 'node:crypto';
import type { TestApp } from './app.js';
import { type Account, call, signUp } from './auth.js';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** A person who is signed in, with a short way to call the API as them. */
export interface Person extends Account {
  api(
    method: Method,
    path: string,
    o?: { body?: object; query?: Record<string, string | number | boolean>; ip?: string },
  ): ReturnType<typeof call>;
}

export async function person(
  t: TestApp,
  o: {
    username?: string;
    private?: boolean;
    state?: string;
    district?: string;
    deviceId?: string;
  } = {},
): Promise<Person> {
  const account = await signUp(t, {
    ...(o.username ? { username: o.username } : {}),
    ...(o.deviceId ? { deviceId: o.deviceId } : {}),
  });
  const p: Person = {
    ...account,
    api: (method, path, opts = {}) =>
      call(t, method, path, { token: p.accessToken, ip: p.ip, ...opts }),
  };
  if (o.private || o.state || o.district) {
    await p
      .api('patch', '/users/me/profile', {
        body: {
          ...(o.private ? { isPrivate: true } : {}),
          ...(o.state ? { state: o.state } : {}),
          ...(o.district ? { district: o.district } : {}),
        },
      })
      .expect(200);
  }
  return p;
}

let storageCounter = 0;

/** A processed media asset, as the media pipeline will leave it. */
export async function insertMedia(
  t: TestApp,
  ownerId: string,
  o: {
    purpose?:
      | 'POST_IMAGE'
      | 'AVATAR'
      | 'STORY'
      | 'REEL_VIDEO'
      | 'REEL_COVER'
      | 'BUSINESS_IMAGE'
      | 'AD_CREATIVE';
    kind?: 'IMAGE' | 'VIDEO';
    status?: 'READY' | 'PENDING_UPLOAD' | 'PROCESSING' | 'REJECTED';
    moderation?: 'APPROVED' | 'PENDING' | 'REMOVED' | 'RESTRICTED';
  } = {},
): Promise<string> {
  storageCounter += 1;
  const asset = await t.db.prisma.mediaAsset.create({
    data: {
      id: randomUUID(),
      ownerId,
      kind: o.kind ?? 'IMAGE',
      purpose: o.purpose ?? 'POST_IMAGE',
      status: o.status ?? 'READY',
      bucket: 'blocks-private',
      storageKey: `test/${ownerId}/${storageCounter}-${randomUUID()}`,
      declaredMime: o.kind === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
      declaredSizeBytes: 123_456,
      sizeBytes: 123_456,
      width: 1080,
      height: 1350,
      thumbnailKey: `test/${ownerId}/${storageCounter}-thumb.jpg`,
      renditions: [{ profile: 'BALANCED', key: `test/${ownerId}/${storageCounter}-main.jpg` }],
      moderationStatus: o.moderation ?? 'APPROVED',
    },
  });
  return asset.id;
}

/** The invariant behind the follow counters: what is stored equals what is counted. */
export async function countersAgree(
  t: TestApp,
  userId: string,
): Promise<{ ok: boolean; detail: string }> {
  const r = await t.db.query<{ fs: number; fg: number; sf: string; sg: string }>(
    `SELECT p.followers_count AS fs, p.following_count AS fg,
            (SELECT count(*) FROM follows WHERE followee_id = p.user_id AND status = 'ACCEPTED') AS sf,
            (SELECT count(*) FROM follows WHERE follower_id = p.user_id AND status = 'ACCEPTED') AS sg
       FROM profiles p WHERE p.user_id = $1`,
    [userId],
  );
  const row = r.rows[0]!;
  const ok = row.fs === Number(row.sf) && row.fg === Number(row.sg);
  return {
    ok,
    detail: `stored followers/following ${row.fs}/${row.fg}, counted ${row.sf}/${row.sg}`,
  };
}

/** Publishes a post as `p` through the real endpoint. */
export async function makePost(
  p: Person,
  over: Record<string, unknown> = {},
): Promise<{ id: string; body: any }> {
  const res = await p
    .api('post', '/posts', {
      body: { type: 'TEXT', caption: `A post ${Math.random().toString(36).slice(2, 8)}`, ...over },
    })
    .expect(201);
  return { id: res.body.data.id as string, body: res.body.data };
}

/** A published, approved reel, as the media pipeline will leave it (reel creation arrives with the media stage). */
export async function insertReel(
  t: TestApp,
  authorId: string,
  o: {
    published?: boolean;
    moderation?: 'APPROVED' | 'PENDING' | 'REMOVED';
    visibility?: 'PUBLIC' | 'FOLLOWERS';
  } = {},
): Promise<string> {
  const reel = await t.db.prisma.reel.create({
    data: {
      authorId,
      caption: 'a reel',
      durationMs: 15_000,
      visibility: o.visibility ?? 'PUBLIC',
      publishStatus: o.published === false ? 'PROCESSING' : 'PUBLISHED',
      moderationStatus: o.moderation ?? 'APPROVED',
      publishedAt: o.published === false ? null : new Date(),
    },
  });
  return reel.id;
}

/** Stored engagement counters of a post against the rows they summarise. */
export async function engagementAgrees(
  t: TestApp,
  postId: string,
): Promise<{ ok: boolean; detail: string }> {
  const r = await t.db.query<Record<string, string | number>>(
    `SELECT p.likes_count AS likes, p.saves_count AS saves, p.comments_count AS comments,
            (SELECT count(*) FROM likes WHERE post_id = p.id) AS like_rows,
            (SELECT count(*) FROM saves WHERE post_id = p.id) AS save_rows,
            (SELECT count(*) FROM comments WHERE post_id = p.id AND status = 'VISIBLE' AND deleted_at IS NULL) AS comment_rows
       FROM posts p WHERE p.id = $1`,
    [postId],
  );
  const x = r.rows[0]!;
  const ok =
    Number(x['likes']) === Number(x['like_rows']) &&
    Number(x['saves']) === Number(x['save_rows']) &&
    Number(x['comments']) === Number(x['comment_rows']);
  return { ok, detail: JSON.stringify(x) };
}
