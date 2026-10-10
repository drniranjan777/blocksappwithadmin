import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SystemSettingsService } from '../../src/common/settings/system-settings.service.js';
import { POSTS_PER_HOUR } from '../../src/social/posts/posts.service.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, freshName } from '../support/auth.js';
import { insertMedia, makePost, person, type Person } from '../support/social.js';

describe('posts', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  const postsCount = async (p: Person) =>
    (await p.api('get', '/users/me/profile').expect(200)).body.data.counts.posts as number;

  describe('publishing', () => {
    it('saves a text post with what the server works out for itself', async () => {
      const me = await person(t, { state: 'Telangana', district: 'Hyderabad' });
      const res = await me
        .api('post', '/posts', {
          body: {
            type: 'TEXT',
            caption: '  Morning at #Charminar \u200Band #HYDERABAD  #charminar\n\n\n\nbest chai ',
          },
        })
        .expect(201);
      expect(res.body.data).toMatchObject({
        type: 'TEXT',
        caption: 'Morning at #Charminar and #HYDERABAD  #charminar\n\nbest chai',
        hashtags: ['charminar', 'hyderabad'],
        visibility: 'PUBLIC',
        label: 'ORIGINAL',
        location: { country: 'IN', state: 'Telangana', district: 'Hyderabad' },
        counts: { likes: 0, comments: 0, shares: 0, saves: 0, views: 0 },
        viewer: { liked: false, saved: false, isAuthor: true },
        reachLevel: 'DISTRICT',
        moderation: { status: 'APPROVED', held: false },
        allowComments: true,
        allowSharing: true,
        editedAt: null,
        media: [],
      });
      expect(res.body.data.author).toMatchObject({
        id: me.id,
        username: me.username,
        displayName: 'Test Person',
      });
      expect(await postsCount(me)).toBe(1);
      // The author sees it on their profile; the view has no internals.
      expect(JSON.stringify(res.body)).not.toMatch(
        /mentionedUserIds|authorId|deletedAt|moderationStatus/,
      );
    });

    it('takes the place from the author’s profile, never from the request', async () => {
      const me = await person(t, { state: 'Kerala', district: 'Kochi' });
      for (const extra of [
        { state: 'Delhi' },
        { district: 'Mumbai' },
        { country: 'US' },
        { city: 'Nowhere' },
      ]) {
        await me
          .api('post', '/posts', { body: { type: 'TEXT', caption: 'hi', ...extra } })
          .expect(400);
      }
      const ok = await makePost(me);
      expect(ok.body.location).toMatchObject({ state: 'Kerala', district: 'Kochi' });
    });

    it('refuses everything the client has no business choosing', async () => {
      const me = await person(t);
      const forbidden: Array<Record<string, unknown>> = [
        { reachLevel: 'GLOBAL' },
        { qualifiedReach: 1_000_000 },
        { moderationStatus: 'APPROVED' },
        { likesCount: 99 },
        { viewsCount: 99 },
        { authorId: '01990000-0000-7000-8000-000000000001' },
        { publishedAt: '2020-01-01T00:00:00Z' },
        { businessPageId: '01990000-0000-7000-8000-000000000001' },
        { deletedAt: null },
        { mentionedUserIds: ['01990000-0000-7000-8000-000000000001'] },
        { hashtags: ['sneaky'] },
        { label: 'VERIFIED_PUBLISHER' },
        { label: 'CORRECTED' },
      ];
      for (const extra of forbidden) {
        const res = await me.api('post', '/posts', {
          body: { type: 'TEXT', caption: 'hi', ...extra },
        });
        expect(res.status, JSON.stringify(extra)).toBe(400);
      }
      expect(await postsCount(me)).toBe(0);
    });

    it('validates the shape of a post', async () => {
      const me = await person(t);
      const bad: Array<[Record<string, unknown>, string]> = [
        [{ type: 'TEXT', caption: '   ' }, 'caption'],
        [{ type: 'TEXT', caption: '' }, 'caption'],
        [{ type: 'TEXT', caption: 'x'.repeat(2201) }, 'caption'],
        [
          { type: 'TEXT', caption: 'hi', mediaIds: ['01990000-0000-7000-8000-000000000001'] },
          'mediaIds',
        ],
        [{ type: 'PHOTO', caption: 'no photos' }, 'mediaIds'],
        [{ type: 'PHOTO', caption: 'x', mediaIds: [] }, 'mediaIds'],
        [{ type: 'VIDEO', caption: 'x' }, 'type'],
        [{ type: 'TEXT', caption: 'x', visibility: 'EVERYONE' }, 'visibility'],
        [
          { type: 'TEXT', caption: Array.from({ length: 31 }, (_, i) => `#tag${i}x`).join(' ') },
          'caption',
        ],
        [
          {
            type: 'TEXT',
            caption: Array.from({ length: 21 }, (_, i) => `@person_${i}x`).join(' '),
          },
          'caption',
        ],
        [{ type: 'TEXT', caption: 'x', allowComments: 'sure' }, 'allowComments'],
      ];
      for (const [body, field] of bad) {
        const res = await me.api('post', '/posts', { body });
        expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
        expect(JSON.stringify(res.body.error.details) ?? '').toContain(field);
      }
    });

    it('needs a signed-in, active account', async () => {
      await t.http.post('/api/v1/posts').send({ type: 'TEXT', caption: 'hi' }).expect(401);
      const leaving = await person(t);
      await leaving
        .api('post', '/account/deletion/request', { body: { password: leaving.password } })
        .expect(200);
      const res = await leaving
        .api('post', '/posts', { body: { type: 'TEXT', caption: 'one last' } })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('slows a runaway: too many in an hour is refused, older ones do not count', async () => {
      const me = await person(t);
      await t.db.query(
        `INSERT INTO posts (id, author_id, caption, updated_at)
         SELECT gen_random_uuid(), $1::uuid, 'bulk ' || g, now() FROM generate_series(1, $2::int) g`,
        [me.id, POSTS_PER_HOUR],
      );
      const refused = await me
        .api('post', '/posts', { body: { type: 'TEXT', caption: 'one too many' } })
        .expect(429);
      expect(refused.body.error.code).toBe('RATE_LIMITED');
      await t.db.query(
        "UPDATE posts SET created_at = now() - interval '2 hours' WHERE author_id = $1",
        [me.id],
      );
      await makePost(me);
    });
  });

  describe('photo posts', () => {
    it('attach your own finished photos, in order, and show addresses not storage keys', async () => {
      const me = await person(t);
      const [a, b, c] = [
        await insertMedia(t, me.id),
        await insertMedia(t, me.id),
        await insertMedia(t, me.id),
      ];
      const res = await me
        .api('post', '/posts', { body: { type: 'PHOTO', caption: 'Trip', mediaIds: [c, a, b] } })
        .expect(201);
      expect(res.body.data.media.map((m: { id: string }) => m.id)).toEqual([c, a, b]);
      expect(res.body.data.media[0]).toMatchObject({ kind: 'IMAGE', width: 1080, height: 1350 });
      // Signed, expiring links to the processed copies (never the original).
      expect(res.body.data.media[0].url).toMatch(/^http.*-main\.jpg\?e=\d+&s=[\w-]+$/);
      expect(res.body.data.media[0].thumbnailUrl).toMatch(/-thumb\.jpg\?e=\d+&s=[\w-]+$/);
      expect(res.body.data.media[0].variants[0]).toMatchObject({ profile: 'BALANCED' });
      expect(JSON.stringify(res.body)).not.toMatch(/storageKey|bucket|blocks-private|sha256/);
    });

    it('may have no caption', async () => {
      const me = await person(t);
      const a = await insertMedia(t, me.id);
      const res = await me
        .api('post', '/posts', { body: { type: 'PHOTO', caption: '', mediaIds: [a] } })
        .expect(201);
      expect(res.body.data.caption).toBe('');
    });

    it('refuses photos that are not yours, not ready, the wrong kind, or already used', async () => {
      const me = await person(t);
      const other = await person(t);
      const used = await insertMedia(t, me.id);
      await me
        .api('post', '/posts', { body: { type: 'PHOTO', caption: 'first', mediaIds: [used] } })
        .expect(201);

      const cases: Array<[string, string]> = [
        ['someone else’s', await insertMedia(t, other.id)],
        ['still processing', await insertMedia(t, me.id, { status: 'PROCESSING' })],
        ['rejected', await insertMedia(t, me.id, { status: 'REJECTED' })],
        ['an avatar picture', await insertMedia(t, me.id, { purpose: 'AVATAR' })],
        ['a video', await insertMedia(t, me.id, { kind: 'VIDEO' })],
        ['removed by moderation', await insertMedia(t, me.id, { moderation: 'REMOVED' })],
        ['already in a post', used],
        ['not an asset', '01990000-0000-7000-8000-000000000001'],
      ];
      for (const [label, id] of cases) {
        const res = await me.api('post', '/posts', {
          body: { type: 'PHOTO', caption: 'x', mediaIds: [id] },
        });
        expect(res.status, label).toBe(400);
        expect(JSON.stringify(res.body.error.details), label).toContain('not_available');
      }
      // One bad photo spoils the post: nothing is half-attached.
      const good = await insertMedia(t, me.id);
      await me
        .api('post', '/posts', {
          body: { type: 'PHOTO', caption: 'x', mediaIds: [good, cases[0]![1]] },
        })
        .expect(400);
      await me
        .api('post', '/posts', { body: { type: 'PHOTO', caption: 'x', mediaIds: [good] } })
        .expect(201);
    });

    it('is held for review while a photo awaits moderation', async () => {
      const me = await person(t);
      const viewer = await person(t);
      const pending = await insertMedia(t, me.id, { moderation: 'PENDING' });
      const res = await me
        .api('post', '/posts', { body: { type: 'PHOTO', caption: 'wait', mediaIds: [pending] } })
        .expect(201);
      expect(res.body.data.moderation).toEqual({ status: 'PENDING', held: true });
      await viewer.api('get', `/posts/${res.body.data.id}`).expect(404);
      await me.api('get', `/posts/${res.body.data.id}`).expect(200);
    });
  });

  describe('mentions', () => {
    it('tell people who could open the post, once, and never the author or the unknown', async () => {
      const author = await person(t);
      const friend = await person(t);
      const stranger = await person(t);
      await friend.api('post', `/users/${author.id}/follow`).expect(200);
      const blockedPerson = await person(t);
      await author.api('post', `/users/${blockedPerson.id}/block`).expect(200);

      const { id } = await makePost(author, {
        caption: `Hello @${friend.username} @${stranger.username} @${blockedPerson.username} @${author.username} @nobody_here_${freshName('x').slice(-4)}`,
      });
      for (const [who, expected] of [
        [friend, 1],
        [stranger, 1],
        [blockedPerson, 0],
        [author, 0],
      ] as const) {
        const list = await who.api('get', '/notifications').expect(200);
        const mentions = list.body.data.filter((n: { type: string }) => n.type === 'MENTION');
        expect(mentions, who.username).toHaveLength(expected);
        if (expected) expect(mentions[0].data).toEqual({ postId: id, userId: author.id });
      }
    });

    it('stay quiet for private posts and for people who could not open a private account’s post', async () => {
      const owner = await person(t, { private: true });
      const friend = await person(t);
      const outsider = await person(t);
      await friend.api('post', `/users/${owner.id}/follow`).expect(200);
      await owner.api('post', `/users/me/follow-requests/${friend.id}/approve`).expect(200);

      await makePost(owner, { caption: `hi @${friend.username} @${outsider.username}` });
      expect(
        (await friend.api('get', '/notifications').expect(200)).body.data.filter(
          (n: { type: string }) => n.type === 'MENTION',
        ),
      ).toHaveLength(1);
      expect(
        (await outsider.api('get', '/notifications').expect(200)).body.data.filter(
          (n: { type: string }) => n.type === 'MENTION',
        ),
      ).toHaveLength(0);

      const p2 = await person(t);
      const other = await person(t);
      await makePost(p2, { visibility: 'PRIVATE', caption: `secret @${other.username}` });
      expect(
        (await other.api('get', '/notifications').expect(200)).body.data.filter(
          (n: { type: string }) => n.type === 'MENTION',
        ),
      ).toHaveLength(0);
    });
  });

  describe('the first-pass screen', () => {
    it('holds a flagged post for review: the author sees it, nobody else does', async () => {
      await t.db.prisma.systemSetting.upsert({
        where: { key: 'moderation.blocked_terms' },
        create: { key: 'moderation.blocked_terms', value: ['forbiddenword'] },
        update: { value: ['forbiddenword'] },
      });
      t.app.get(SystemSettingsService, { strict: false }).invalidate();

      const me = await person(t);
      const fan = await person(t);
      await fan.api('post', `/users/${me.id}/follow`).expect(200);
      const held = await makePost(me, { caption: 'this has a ForbiddenWord inside' });
      expect(held.body.moderation).toEqual({ status: 'PENDING', held: true });

      await fan.api('get', `/posts/${held.id}`).expect(404);
      await me.api('get', `/posts/${held.id}`).expect(200);
      const theirs = await fan.api('get', `/profiles/${me.username}/posts`).expect(200);
      expect(theirs.body.data.map((p: { id: string }) => p.id)).not.toContain(held.id);
      const mine = await me.api('get', `/profiles/${me.username}/posts`).expect(200);
      expect(mine.body.data.map((p: { id: string }) => p.id)).toContain(held.id);
    });

    it('does not notify mentions for a post that is held', async () => {
      const me = await person(t);
      const other = await person(t);
      await makePost(me, { caption: `forbiddenword @${other.username}` });
      expect((await other.api('get', '/notifications').expect(200)).body.data).toEqual([]);
    });

    it('lets innocent words that contain a listed one through', async () => {
      const me = await person(t);
      const ok = await makePost(me, { caption: 'forbiddenwordsmith is just a surname' });
      expect(ok.body.moderation.status).toBe('APPROVED');
    });
  });

  describe('retrying', () => {
    it('gives the first answer back for the same key, and makes one post', async () => {
      const me = await person(t);
      const key = `key-${freshName('k')}`;
      const body = { type: 'TEXT', caption: 'only once' };
      const one = await me.api('post', '/posts', { body }).set('Idempotency-Key', key).expect(201);
      const two = await me.api('post', '/posts', { body }).set('Idempotency-Key', key).expect(201);
      expect(two.body.data.id).toBe(one.body.data.id);
      expect(await postsCount(me)).toBe(1);
    });

    it('refuses the same key for a different request', async () => {
      const me = await person(t);
      const key = `key-${freshName('k')}`;
      await me
        .api('post', '/posts', { body: { type: 'TEXT', caption: 'first' } })
        .set('Idempotency-Key', key)
        .expect(201);
      const res = await me
        .api('post', '/posts', { body: { type: 'TEXT', caption: 'second' } })
        .set('Idempotency-Key', key)
        .expect(409);
      expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(await postsCount(me)).toBe(1);
    });

    it('keeps one person’s keys from touching another’s', async () => {
      const a = await person(t);
      const b = await person(t);
      const key = `key-${freshName('k')}`;
      const body = { type: 'TEXT', caption: 'same words' };
      const one = await a.api('post', '/posts', { body }).set('Idempotency-Key', key).expect(201);
      const two = await b.api('post', '/posts', { body }).set('Idempotency-Key', key).expect(201);
      expect(two.body.data.id).not.toBe(one.body.data.id);
      expect(two.body.data.author.id).toBe(b.id);
    });

    it('rejects a malformed key', async () => {
      const me = await person(t);
      for (const key of ['short', 'has spaces in it!!', 'x'.repeat(101)]) {
        const res = await me
          .api('post', '/posts', { body: { type: 'TEXT', caption: 'x' } })
          .set('Idempotency-Key', key);
        expect(res.status, key).toBe(400);
      }
    });

    it('releases the key when the work fails, so a corrected retry goes through', async () => {
      const me = await person(t);
      const key = `key-${freshName('k')}`;
      const bad = await me
        .api('post', '/posts', {
          body: { type: 'PHOTO', caption: 'x', mediaIds: ['01990000-0000-7000-8000-000000000001'] },
        })
        .set('Idempotency-Key', key);
      expect(bad.status).toBe(400);
      const media = await insertMedia(t, me.id);
      await me
        .api('post', '/posts', { body: { type: 'PHOTO', caption: 'x', mediaIds: [media] } })
        .set('Idempotency-Key', key)
        .expect(201);
    });

    it('makes one post when the same request arrives many times at once', async () => {
      const me = await person(t);
      const key = `key-${freshName('k')}`;
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          me
            .api('post', '/posts', { body: { type: 'TEXT', caption: 'storm' } })
            .set('Idempotency-Key', key),
        ),
      );
      expect(results.every((r) => r.status === 201 || r.status === 409)).toBe(true);
      expect(results.some((r) => r.status === 201)).toBe(true);
      expect(await postsCount(me)).toBe(1);
      const ids = new Set(results.filter((r) => r.status === 201).map((r) => r.body.data.id));
      expect(ids.size).toBe(1);
    });
  });

  describe('who can see a post', () => {
    /** One post of each visibility by `author`, and the ids by visibility. */
    async function onePerVisibility(author: Person) {
      const ids: Record<string, string> = {};
      for (const visibility of ['PUBLIC', 'FOLLOWERS', 'CLOSE_FRIENDS', 'PRIVATE']) {
        ids[visibility] = (
          await makePost(author, { visibility, caption: `${visibility} post` })
        ).id;
      }
      return ids;
    }

    const canSee = async (viewer: Person, id: string) =>
      (await viewer.api('get', `/posts/${id}`)).status === 200;

    it('follows the visibility chosen, for every kind of viewer', async () => {
      const author = await person(t);
      const stranger = await person(t);
      const follower = await person(t);
      const closeFriend = await person(t);
      await follower.api('post', `/users/${author.id}/follow`).expect(200);
      await closeFriend.api('post', `/users/${author.id}/follow`).expect(200);
      await author.api('put', `/users/me/close-friends/${closeFriend.id}`).expect(200);
      const ids = await onePerVisibility(author);

      const seen = async (viewer: Person) => {
        const out: string[] = [];
        for (const [vis, id] of Object.entries(ids)) if (await canSee(viewer, id)) out.push(vis);
        return out;
      };
      expect(await seen(stranger)).toEqual(['PUBLIC']);
      expect(await seen(follower)).toEqual(['PUBLIC', 'FOLLOWERS']);
      expect(await seen(closeFriend)).toEqual(['PUBLIC', 'FOLLOWERS', 'CLOSE_FRIENDS']);
      expect(await seen(author)).toEqual(['PUBLIC', 'FOLLOWERS', 'CLOSE_FRIENDS', 'PRIVATE']);

      // The profile list agrees with the single lookups.
      const listed = async (viewer: Person) =>
        (
          await viewer
            .api('get', `/profiles/${author.username}/posts`, { query: { limit: 50 } })
            .expect(200)
        ).body.data
          .map((p: { caption: string }) => p.caption.split(' ')[0])
          .sort();
      expect(await listed(stranger)).toEqual(['PUBLIC']);
      expect(await listed(follower)).toEqual(['FOLLOWERS', 'PUBLIC']);
      expect(await listed(closeFriend)).toEqual(['CLOSE_FRIENDS', 'FOLLOWERS', 'PUBLIC']);
      expect(await listed(author)).toEqual(['CLOSE_FRIENDS', 'FOLLOWERS', 'PRIVATE', 'PUBLIC']);
    });

    it('shows a private account’s posts only to accepted followers, even the public ones', async () => {
      const owner = await person(t, { private: true });
      const waiting = await person(t);
      const follower = await person(t);
      const stranger = await person(t);
      await waiting.api('post', `/users/${owner.id}/follow`).expect(200);
      await follower.api('post', `/users/${owner.id}/follow`).expect(200);
      await owner.api('post', `/users/me/follow-requests/${follower.id}/approve`).expect(200);
      const pub = await makePost(owner, { visibility: 'PUBLIC' });

      expect(await canSee(stranger, pub.id)).toBe(false);
      expect(await canSee(waiting, pub.id)).toBe(false);
      expect(await canSee(follower, pub.id)).toBe(true);
      await stranger.api('get', `/profiles/${owner.username}/posts`).expect(403);
      await waiting.api('get', `/profiles/${owner.username}/posts`).expect(403);
      expect(
        (await follower.api('get', `/profiles/${owner.username}/posts`).expect(200)).body.data,
      ).toHaveLength(1);
    });

    it('shows nothing across a block, in either direction', async () => {
      const author = await person(t);
      const viewer = await person(t);
      const { id } = await makePost(author);
      expect(await canSee(viewer, id)).toBe(true);

      await viewer.api('post', `/users/${author.id}/block`).expect(200);
      expect(await canSee(viewer, id)).toBe(false);
      await viewer.api('get', `/profiles/${author.username}/posts`).expect(404);
      await viewer.api('delete', `/users/${author.id}/block`).expect(204);
      expect(await canSee(viewer, id)).toBe(true);

      await author.api('post', `/users/${viewer.id}/block`).expect(200);
      expect(await canSee(viewer, id)).toBe(false);
      await viewer.api('get', `/profiles/${author.username}/posts`).expect(404);
      expect(await canSee(author, id)).toBe(true);
    });

    it('hides posts that are held, restricted, removed or deleted from everyone but the right people', async () => {
      const author = await person(t);
      const viewer = await person(t);
      const states: Array<[string, boolean]> = [
        ['APPROVED', true],
        ['PENDING', false],
        ['RESTRICTED', false],
        ['REMOVED', false],
      ];
      for (const [status, visible] of states) {
        const { id } = await makePost(author);
        await t.db.query(
          'UPDATE posts SET moderation_status = $2::moderation_status WHERE id = $1',
          [id, status],
        );
        expect(await canSee(viewer, id), status).toBe(visible);
        expect(await canSee(author, id), `${status} (author)`).toBe(true);
      }
      const { id } = await makePost(author);
      await author.api('delete', `/posts/${id}`).expect(204);
      expect(await canSee(viewer, id)).toBe(false);
      expect(await canSee(author, id)).toBe(false);
    });

    it('hides the posts of an account that is suspended or leaving', async () => {
      const author = await person(t);
      const viewer = await person(t);
      const { id } = await makePost(author);
      await t.db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [author.id]);
      expect(await canSee(viewer, id)).toBe(false);
      await t.db.query("UPDATE users SET status = 'PENDING_DELETION' WHERE id = $1", [author.id]);
      expect(await canSee(viewer, id)).toBe(false);
      await t.db.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [author.id]);
      expect(await canSee(viewer, id)).toBe(true);
    });

    it('answers a missing post, a hidden post and a bad id in the shapes you would expect', async () => {
      const me = await person(t);
      await me.api('get', '/posts/01990000-0000-7000-8000-000000000001').expect(404);
      await me.api('get', '/posts/not-a-uuid').expect(400);
      await t.http.get('/api/v1/posts/01990000-0000-7000-8000-000000000001').expect(401);
    });
  });

  describe('a person’s list', () => {
    it('pages newest first without gaps or repeats, and filters by type', async () => {
      const me = await person(t);
      const viewer = await person(t);
      const made: string[] = [];
      for (let i = 0; i < 7; i++)
        made.push((await makePost(me, { caption: `post number ${i}` })).id);
      const photo = await insertMedia(t, me.id);
      const photoPost = await makePost(me, { type: 'PHOTO', caption: 'pic', mediaIds: [photo] });

      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const res = await viewer
          .api('get', `/profiles/${me.username}/posts`, {
            query: { limit: 3, ...(cursor ? { cursor } : {}) },
          })
          .expect(200);
        seen.push(...res.body.data.map((p: { id: string }) => p.id));
        cursor = res.body.meta.hasMore ? res.body.meta.nextCursor : undefined;
        pages++;
      } while (cursor && pages < 10);
      expect(seen).toEqual([photoPost.id, ...made.slice().reverse()]);
      expect(pages).toBe(3);

      const photos = await viewer
        .api('get', `/profiles/${me.username}/posts`, { query: { type: 'PHOTO' } })
        .expect(200);
      expect(photos.body.data.map((p: { id: string }) => p.id)).toEqual([photoPost.id]);
      await viewer
        .api('get', `/profiles/${me.username}/posts`, { query: { type: 'VIDEO' } })
        .expect(400);
      await viewer
        .api('get', `/profiles/${me.username}/posts`, { query: { cursor: 'garbage' } })
        .expect(400);
    });

    it('reports what the viewer has liked and saved (set in the engagement tests)', async () => {
      const me = await person(t);
      await makePost(me);
      const res = await me.api('get', `/profiles/${me.username}/posts`).expect(200);
      expect(res.body.data[0].viewer).toEqual({ liked: false, saved: false, isAuthor: true });
    });

    it('is not found for a profile that does not exist', async () => {
      const me = await person(t);
      await me.api('get', `/profiles/${freshName('ghost')}/posts`).expect(404);
    });
  });

  describe('editing', () => {
    it('changes the caption (and with it the hashtags), marks it edited, and keeps the rest', async () => {
      const me = await person(t);
      const { id, body } = await makePost(me, { caption: 'first #one', visibility: 'FOLLOWERS' });
      const res = await me
        .api('patch', `/posts/${id}`, { body: { caption: 'second #two #three' } })
        .expect(200);
      expect(res.body.data).toMatchObject({
        caption: 'second #two #three',
        hashtags: ['two', 'three'],
        visibility: 'FOLLOWERS',
      });
      expect(res.body.data.editedAt).not.toBeNull();
      expect(res.body.data.publishedAt).toBe(body.publishedAt);
    });

    it('changes visibility, label and the switches without touching the caption', async () => {
      const me = await person(t);
      const { id } = await makePost(me, { caption: 'stays' });
      const res = await me
        .api('patch', `/posts/${id}`, {
          body: {
            visibility: 'PRIVATE',
            label: 'COMMUNITY_REPORT',
            allowComments: false,
            allowSharing: false,
          },
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        caption: 'stays',
        visibility: 'PRIVATE',
        label: 'COMMUNITY_REPORT',
        allowComments: false,
        allowSharing: false,
        editedAt: null,
      });
    });

    it('keeps the rules: a text post needs words, photos cannot be swapped, only your own can be edited', async () => {
      const me = await person(t);
      const other = await person(t);
      const text = await makePost(me);
      await me.api('patch', `/posts/${text.id}`, { body: { caption: '   ' } }).expect(400);
      await me.api('patch', `/posts/${text.id}`, { body: { type: 'PHOTO' } }).expect(400);
      await me.api('patch', `/posts/${text.id}`, { body: { mediaIds: [] } }).expect(400);
      await me.api('patch', `/posts/${text.id}`, { body: { reachLevel: 'GLOBAL' } }).expect(400);
      await me
        .api('patch', `/posts/${text.id}`, { body: { label: 'VERIFIED_PUBLISHER' } })
        .expect(400);
      await other.api('patch', `/posts/${text.id}`, { body: { caption: 'mine now' } }).expect(404);

      const pic = await makePost(me, {
        type: 'PHOTO',
        caption: 'p',
        mediaIds: [await insertMedia(t, me.id)],
      });
      const emptied = await me
        .api('patch', `/posts/${pic.id}`, { body: { caption: '' } })
        .expect(200);
      expect(emptied.body.data.caption).toBe('');
    });

    it('sends an approved post back to review if the edit trips the screen, and cannot be used to approve one', async () => {
      await t.db.prisma.systemSetting.upsert({
        where: { key: 'moderation.blocked_terms' },
        create: { key: 'moderation.blocked_terms', value: ['forbiddenword'] },
        update: { value: ['forbiddenword'] },
      });
      t.app.get(SystemSettingsService, { strict: false }).invalidate();
      const me = await person(t);
      const viewer = await person(t);
      const { id } = await makePost(me, { caption: 'fine' });
      await viewer.api('get', `/posts/${id}`).expect(200);

      const edited = await me
        .api('patch', `/posts/${id}`, { body: { caption: 'now with forbiddenword' } })
        .expect(200);
      expect(edited.body.data.moderation).toEqual({ status: 'PENDING', held: true });
      await viewer.api('get', `/posts/${id}`).expect(404);

      // Cleaning the words does not publish it again: a person decides that.
      const cleaned = await me
        .api('patch', `/posts/${id}`, { body: { caption: 'fine again' } })
        .expect(200);
      expect(cleaned.body.data.moderation.status).toBe('PENDING');
      await viewer.api('get', `/posts/${id}`).expect(404);
    });

    it('cannot get around a moderation decision by editing', async () => {
      const me = await person(t);
      const { id } = await makePost(me);
      for (const status of ['REMOVED', 'RESTRICTED']) {
        await t.db.query(
          'UPDATE posts SET moderation_status = $2::moderation_status WHERE id = $1',
          [id, status],
        );
        const res = await me
          .api('patch', `/posts/${id}`, { body: { caption: 'sneaky edit' } })
          .expect(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });

    it('is not possible for a deleted post', async () => {
      const me = await person(t);
      const { id } = await makePost(me);
      await me.api('delete', `/posts/${id}`).expect(204);
      await me
        .api('patch', `/posts/${id}`, { body: { caption: 'back from the dead' } })
        .expect(404);
    });
  });

  describe('deleting', () => {
    it('removes it from view and from the count, safely repeated', async () => {
      const me = await person(t);
      const viewer = await person(t);
      const a = await makePost(me);
      await makePost(me);
      expect(await postsCount(me)).toBe(2);
      await me.api('delete', `/posts/${a.id}`).expect(204);
      await me.api('delete', `/posts/${a.id}`).expect(204);
      expect(await postsCount(me)).toBe(1);
      await viewer.api('get', `/posts/${a.id}`).expect(404);
      const list = await viewer.api('get', `/profiles/${me.username}/posts`).expect(200);
      expect(list.body.data.map((p: { id: string }) => p.id)).not.toContain(a.id);
      const row = await t.db.query<{ deleted_at: Date | null }>(
        'SELECT deleted_at FROM posts WHERE id = $1',
        [a.id],
      );
      expect(row.rows[0]?.deleted_at).not.toBeNull();
    });

    it('is only for the author', async () => {
      const me = await person(t);
      const other = await person(t);
      const { id } = await makePost(me);
      await other.api('delete', `/posts/${id}`).expect(404);
      await other.api('delete', '/posts/01990000-0000-7000-8000-000000000001').expect(404);
      await me.api('get', `/posts/${id}`).expect(200);
    });

    it('keeps the count right when deletes happen at once', async () => {
      const me = await person(t);
      const ids = [];
      for (let i = 0; i < 6; i++) ids.push((await makePost(me)).id);
      await Promise.all(
        ids.flatMap((id) => [me.api('delete', `/posts/${id}`), me.api('delete', `/posts/${id}`)]),
      );
      expect(await postsCount(me)).toBe(0);
      const stored = await t.db.query<{ n: number; c: string }>(
        `SELECT p.posts_count AS n, (SELECT count(*) FROM posts WHERE author_id = p.user_id AND deleted_at IS NULL) AS c
           FROM profiles p WHERE p.user_id = $1`,
        [me.id],
      );
      expect(stored.rows[0]?.n).toBe(Number(stored.rows[0]?.c));
    });
  });
});
