import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SystemSettingsService } from '../../src/common/settings/system-settings.service.js';
import { TrendingService } from '../../src/social/feed/trending.service.js';
import { StoriesService } from '../../src/social/stories/stories.service.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, freshName } from '../support/auth.js';
import { insertMedia, makePost, person, type Person } from '../support/social.js';

describe('feeds, hashtags, trending and stories', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  const feed = async (p: Person, scope: string, query: Record<string, string | number> = {}) =>
    (await p.api('get', '/feed', { query: { scope, ...query } }).expect(200)).body;
  const ids = (body: { data: Array<{ post: { id: string } }> }) => body.data.map((i) => i.post.id);

  describe('following', () => {
    it('shows me and the people I follow, newest first, and nobody else', async () => {
      const me = await person(t);
      const friend = await person(t);
      const stranger = await person(t);
      await me.api('post', `/users/${friend.id}/follow`).expect(200);
      const a = await makePost(friend);
      const b = await makePost(me);
      await makePost(stranger);
      const c = await makePost(friend);

      const body = await feed(me, 'following');
      expect(ids(body)).toEqual([c.id, b.id, a.id]);
      expect(body.data[0]).toMatchObject({ kind: 'post', post: { author: { id: friend.id } } });
      // Following is the default.
      expect(ids((await me.api('get', '/feed').expect(200)).body)).toEqual([c.id, b.id, a.id]);
    });

    it('is empty until I follow someone, and gains a post the moment I do', async () => {
      const me = await person(t);
      const friend = await person(t);
      const { id } = await makePost(friend);
      expect((await feed(me, 'following')).data).toEqual([]);
      await me.api('post', `/users/${friend.id}/follow`).expect(200);
      expect(ids(await feed(me, 'following'))).toEqual([id]);
      await me.api('delete', `/users/${friend.id}/follow`).expect(200);
      expect((await feed(me, 'following')).data).toEqual([]);
    });

    it('applies the same visibility rules as everywhere else', async () => {
      const me = await person(t);
      const friend = await person(t);
      await me.api('post', `/users/${friend.id}/follow`).expect(200);
      const pub = await makePost(friend, { visibility: 'PUBLIC' });
      const followers = await makePost(friend, { visibility: 'FOLLOWERS' });
      await makePost(friend, { visibility: 'CLOSE_FRIENDS' });
      await makePost(friend, { visibility: 'PRIVATE' });
      expect(ids(await feed(me, 'following')).sort()).toEqual([pub.id, followers.id].sort());

      await friend.api('put', `/users/me/close-friends/${me.id}`).expect(200);
      expect((await feed(me, 'following')).data).toHaveLength(3);

      await t.db.query("UPDATE posts SET moderation_status = 'PENDING' WHERE id = $1", [pub.id]);
      expect(ids(await feed(me, 'following'))).not.toContain(pub.id);
    });

    it('drops people I muted but keeps those I still follow, and everything from people I blocked', async () => {
      const me = await person(t);
      const quiet = await person(t);
      const loud = await person(t);
      for (const p of [quiet, loud]) await me.api('post', `/users/${p.id}/follow`).expect(200);
      await makePost(quiet);
      const keep = await makePost(loud);
      await me.api('post', `/users/${quiet.id}/mute`).expect(200);
      expect(ids(await feed(me, 'following'))).toEqual([keep.id]);
      await me.api('post', `/users/${loud.id}/block`).expect(200);
      expect((await feed(me, 'following')).data).toEqual([]);
    });

    it('pages without gaps or repeats', async () => {
      const me = await person(t);
      const friend = await person(t);
      await me.api('post', `/users/${friend.id}/follow`).expect(200);
      const made: string[] = [];
      for (let i = 0; i < 7; i++) made.push((await makePost(friend)).id);
      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const body = await feed(me, 'following', { limit: 3, ...(cursor ? { cursor } : {}) });
        seen.push(...ids(body));
        cursor = body.meta.hasMore ? body.meta.nextCursor : undefined;
        pages++;
      } while (cursor && pages < 10);
      expect(seen).toEqual(made.slice().reverse());
      expect(pages).toBe(3);
    });

    it('does not move when new posts arrive mid-scroll', async () => {
      const me = await person(t);
      const friend = await person(t);
      await me.api('post', `/users/${friend.id}/follow`).expect(200);
      const first: string[] = [];
      for (let i = 0; i < 4; i++) first.push((await makePost(friend)).id);
      const page1 = await feed(me, 'following', { limit: 2 });
      await makePost(friend); // arrives while the person is reading
      const page2 = await feed(me, 'following', { limit: 2, cursor: page1.meta.nextCursor });
      expect([...ids(page1), ...ids(page2)]).toEqual(first.slice().reverse());
    });

    it('rejects an unknown scope, a tampered cursor and a missing sign-in', async () => {
      const me = await person(t);
      await me.api('get', '/feed', { query: { scope: 'everywhere' } }).expect(400);
      await me.api('get', '/feed', { query: { cursor: 'tampered' } }).expect(400);
      await me.api('get', '/feed', { query: { limit: 500 } }).expect(400);
      await t.http.get('/api/v1/feed').expect(401);
    });
  });

  describe('by place and by reach', () => {
    it('local shows my district, state shows my state, and neither shows me myself', async () => {
      const me = await person(t, { state: 'Telangana', district: 'Hyderabad' });
      const sameDistrict = await person(t, { state: 'Telangana', district: 'Hyderabad' });
      const sameState = await person(t, { state: 'Telangana', district: 'Warangal' });
      const elsewhere = await person(t, { state: 'Kerala', district: 'Kochi' });
      const inDistrict = await makePost(sameDistrict);
      const inState = await makePost(sameState);
      await makePost(elsewhere);
      await makePost(me);

      expect(ids(await feed(me, 'local'))).toEqual([inDistrict.id]);
      expect(ids(await feed(me, 'state'))).toEqual([inState.id, inDistrict.id]);
    });

    it('stays empty until the profile has a place', async () => {
      const me = await person(t);
      const other = await person(t, { state: 'Goa', district: 'North Goa' });
      await makePost(other);
      expect((await feed(me, 'local')).data).toEqual([]);
      expect((await feed(me, 'state')).data).toEqual([]);
      await me.api('patch', '/users/me/profile', { body: { state: 'Goa' } }).expect(200);
      expect((await feed(me, 'state')).data).toHaveLength(1);
      expect((await feed(me, 'local')).data).toEqual([]);
    });

    it('national and global show only what has earned those rungs', async () => {
      const me = await person(t);
      const author = await person(t, { state: 'Punjab', district: 'Ludhiana' });
      const district = await makePost(author);
      const national = await makePost(author);
      const global = await makePost(author);
      await t.db.query("UPDATE posts SET reach_level = 'NATIONAL' WHERE id = $1", [national.id]);
      await t.db.query("UPDATE posts SET reach_level = 'GLOBAL' WHERE id = $1", [global.id]);

      const n = ids(await feed(me, 'national'));
      expect(n).toEqual(expect.arrayContaining([national.id, global.id]));
      expect(n).not.toContain(district.id);
      const g = ids(await feed(me, 'global'));
      expect(g).toContain(global.id);
      expect(g).not.toContain(national.id);
      expect(g).not.toContain(district.id);
    });

    it('never shows what the viewer could not open directly', async () => {
      const me = await person(t, { state: 'Assam', district: 'Kamrup' });
      const privateAuthor = await person(t, { state: 'Assam', district: 'Kamrup', private: true });
      const followersOnly = await person(t, { state: 'Assam', district: 'Kamrup' });
      await makePost(privateAuthor);
      await makePost(followersOnly, { visibility: 'FOLLOWERS' });
      const open = await makePost(followersOnly, { visibility: 'PUBLIC' });
      expect(ids(await feed(me, 'local'))).toEqual([open.id]);
    });
  });

  describe('hashtags', () => {
    it('lists posts with a tag, in any case, with or without #', async () => {
      const me = await person(t);
      const a = await person(t);
      const tag = `tag${freshName('h').slice(-6)}`;
      const one = await makePost(a, { caption: `first #${tag}` });
      const two = await makePost(a, { caption: `second #${tag.toUpperCase()}` });
      await makePost(a, { caption: 'untagged' });
      const res = await me
        .api('get', `/hashtags/${encodeURIComponent(`#${tag}`)}/posts`)
        .expect(200);
      expect(ids(res.body)).toEqual([two.id, one.id]);
      expect(
        ids((await me.api('get', `/hashtags/${tag.toUpperCase()}/posts`).expect(200)).body),
      ).toEqual([two.id, one.id]);
    });

    it('shows only what the viewer may see, and rejects nonsense', async () => {
      const me = await person(t);
      const a = await person(t);
      const tag = `tag${freshName('v').slice(-6)}`;
      await makePost(a, { caption: `#${tag}`, visibility: 'FOLLOWERS' });
      const open = await makePost(a, { caption: `#${tag}` });
      expect(ids((await me.api('get', `/hashtags/${tag}/posts`).expect(200)).body)).toEqual([
        open.id,
      ]);
      await me.api('get', '/hashtags/a/posts').expect(400);
      await me.api('get', `/hashtags/${'x'.repeat(60)}/posts`).expect(400);
      await me.api('get', '/hashtags/bad%20tag/posts').expect(400);
    });

    it('works for tags in Indian scripts', async () => {
      const me = await person(t);
      const a = await person(t);
      const post = await makePost(a, { caption: 'వర్షం వచ్చింది #హైదరాబాద్ #हिंदी' });
      expect(post.body.hashtags).toEqual(['హైదరాబాద్', 'हिंदी']);
      const res = await me
        .api('get', `/hashtags/${encodeURIComponent('హైదరాబాద్')}/posts`)
        .expect(200);
      expect(ids(res.body)).toEqual([post.id]);
    });
  });

  describe('trending', () => {
    it('counts what is public and approved, by place, and needs two posts', async () => {
      const trending = t.app.get(TrendingService, { strict: false });
      const state = 'Mizoram';
      const district = 'Aizawl';
      const a = await person(t, { state, district });
      const b = await person(t, { state, district });
      const priv = await person(t, { state, district, private: true });
      const viewer = await person(t, { state, district });

      await makePost(a, { caption: 'one #festival #solo' });
      await makePost(b, { caption: 'two #festival' });
      await makePost(a, { caption: 'held #festival', visibility: 'FOLLOWERS' });
      await makePost(priv, { caption: 'private account #festival' });
      const flagged = await makePost(b, { caption: 'flagged #festival' });
      await t.db.query("UPDATE posts SET moderation_status = 'PENDING' WHERE id = $1", [
        flagged.id,
      ]);

      await trending.recompute();
      const local = (
        await viewer.api('get', '/trending', { query: { scope: 'district' } }).expect(200)
      ).body.data;
      expect(local.topics).toEqual([{ rank: 1, tag: 'festival', posts: 2 }]);
      expect(local.key).toBe(`${state}/${district}`);
      const inState = (
        await viewer.api('get', '/trending', { query: { scope: 'state' } }).expect(200)
      ).body.data;
      expect(inState.topics.map((x: { tag: string }) => x.tag)).toContain('festival');
      expect(inState.topics.map((x: { tag: string }) => x.tag)).not.toContain('solo');
    });

    it('forgets a tag once its posts are gone, and recomputing again changes nothing', async () => {
      const trending = t.app.get(TrendingService, { strict: false });
      const a = await person(t, { state: 'Sikkim', district: 'Gangtok' });
      const viewer = await person(t, { state: 'Sikkim', district: 'Gangtok' });
      const p1 = await makePost(a, { caption: '#momos' });
      await makePost(a, { caption: 'again #momos' });
      await trending.recompute();
      await trending.recompute();
      const first = (
        await viewer.api('get', '/trending', { query: { scope: 'district' } }).expect(200)
      ).body.data.topics;
      expect(first).toEqual([{ rank: 1, tag: 'momos', posts: 2 }]);

      await a.api('delete', `/posts/${p1.id}`).expect(204);
      await trending.recompute();
      expect(
        (await viewer.api('get', '/trending', { query: { scope: 'district' } }).expect(200)).body
          .data.topics,
      ).toEqual([]);
    });

    it('says nothing for a place the profile does not have', async () => {
      const me = await person(t);
      const res = await me.api('get', '/trending', { query: { scope: 'district' } }).expect(200);
      expect(res.body.data).toEqual({ scope: 'district', key: null, topics: [] });
      await me.api('get', '/trending', { query: { scope: 'galaxy' } }).expect(400);
    });

    it('suggests tags while typing', async () => {
      const trending = t.app.get(TrendingService, { strict: false });
      const a = await person(t, { state: 'Nagaland', district: 'Kohima' });
      await makePost(a, { caption: '#hornbill' });
      await makePost(a, { caption: '#hornbillfestival' });
      await makePost(a, { caption: 'more #hornbill' });
      await trending.recompute();
      const me = await person(t);
      const res = await me.api('get', '/search/hashtags', { query: { q: '#HORN' } }).expect(200);
      expect(res.body.data[0]).toEqual({ tag: 'hornbill', posts: expect.any(Number) });
      expect(
        (await me.api('get', '/search/hashtags', { query: { q: 'h' } }).expect(200)).body.data,
      ).toEqual([]);
      await me.api('get', '/search/hashtags', { query: { q: 'drop table' } }).expect(400);
    });
  });

  describe('stories', () => {
    const story = (p: Person, mediaId: string, body: Record<string, unknown> = {}) =>
      p.api('post', '/stories', { body: { mediaId, ...body } });
    const storyMedia = (p: Person, o: { kind?: 'IMAGE' | 'VIDEO' } = {}) =>
      insertMedia(t, p.id, { purpose: 'STORY', ...o });

    it('shares a story that expires in 24 hours and is shown only to the right people', async () => {
      const author = await person(t);
      const follower = await person(t);
      const stranger = await person(t);
      await follower.api('post', `/users/${author.id}/follow`).expect(200);

      const res = await story(author, await storyMedia(author), { caption: '  Morning!  ' }).expect(
        201,
      );
      expect(res.body.data).toMatchObject({
        caption: 'Morning!',
        visibility: 'FOLLOWERS',
        viewer: { seen: false, isAuthor: true },
        viewsCount: 0,
        moderation: { status: 'APPROVED', held: false },
      });
      const hours =
        (new Date(res.body.data.expiresAt).getTime() -
          new Date(res.body.data.createdAt).getTime()) /
        3_600_000;
      expect(hours).toBeCloseTo(24, 1);

      const seen = await follower.api('get', `/profiles/${author.username}/stories`).expect(200);
      expect(seen.body.data).toHaveLength(1);
      expect(seen.body.data[0]).not.toHaveProperty('viewsCount');
      expect(
        (await stranger.api('get', `/profiles/${author.username}/stories`).expect(200)).body.data,
      ).toEqual([]);
    });

    it('needs your own finished story media, once', async () => {
      const me = await person(t);
      const other = await person(t);
      const good = await storyMedia(me);
      await story(me, good).expect(201);
      await story(me, good).expect(400);
      for (const id of [
        await storyMedia(other),
        await insertMedia(t, me.id, { purpose: 'POST_IMAGE' }),
        await insertMedia(t, me.id, { purpose: 'STORY', status: 'PROCESSING' }),
        '01990000-0000-7000-8000-000000000001',
      ]) {
        const res = await story(me, id);
        expect(res.status, id).toBe(400);
        expect(JSON.stringify(res.body.error.details)).toContain('not_available');
      }
      await story(me, 'nope').expect(400);
      await story(me, await storyMedia(me), { visibility: 'SECRET' }).expect(400);
      await story(me, await storyMedia(me), { caption: 'x'.repeat(201) }).expect(400);
      await story(me, await storyMedia(me), { expiresAt: '2030-01-01' }).expect(400);
    });

    it('disappears the moment it expires, without waiting for any clean-up', async () => {
      const author = await person(t);
      const follower = await person(t);
      await follower.api('post', `/users/${author.id}/follow`).expect(200);
      const s = (await story(author, await storyMedia(author)).expect(201)).body.data;
      expect(
        (await follower.api('get', `/profiles/${author.username}/stories`).expect(200)).body.data,
      ).toHaveLength(1);

      // The database insists a story expires after it was created, so age it properly: posted 25 hours ago.
      await t.db.query(
        "UPDATE stories SET created_at = now() - interval '25 hours', expires_at = now() - interval '1 second' WHERE id = $1",
        [s.id],
      );
      expect(
        (await follower.api('get', `/profiles/${author.username}/stories`).expect(200)).body.data,
      ).toEqual([]);
      expect(
        (await author.api('get', `/profiles/${author.username}/stories`).expect(200)).body.data,
      ).toEqual([]);
      await follower.api('post', `/stories/${s.id}/view`).expect(404);
      expect((await follower.api('get', '/stories/tray').expect(200)).body.data).toEqual([]);

      expect(
        await t.app.get(StoriesService, { strict: false }).purgeExpired(0),
      ).toBeGreaterThanOrEqual(1);
    });

    it('lets the author set how long stories stay up, within limits', async () => {
      await t.db.prisma.systemSetting.upsert({
        where: { key: 'stories.ttl_hours' },
        create: { key: 'stories.ttl_hours', value: 6 },
        update: { value: 6 },
      });
      t.app.get(SystemSettingsService, { strict: false }).invalidate();
      const author = await person(t);
      const s = (await story(author, await storyMedia(author)).expect(201)).body.data;
      expect(
        (new Date(s.expiresAt).getTime() - new Date(s.createdAt).getTime()) / 3_600_000,
      ).toBeCloseTo(6, 1);
      await t.db.prisma.systemSetting.update({
        where: { key: 'stories.ttl_hours' },
        data: { value: 9999 },
      });
      t.app.get(SystemSettingsService, { strict: false }).invalidate();
      const long = (await story(author, await storyMedia(author)).expect(201)).body.data;
      expect(
        (new Date(long.expiresAt).getTime() - new Date(long.createdAt).getTime()) / 3_600_000,
      ).toBeCloseTo(48, 1);
      await t.db.prisma.systemSetting.delete({ where: { key: 'stories.ttl_hours' } });
      t.app.get(SystemSettingsService, { strict: false }).invalidate();
    });

    it('builds the tray: me first, then people with something new, hiding the seen', async () => {
      const me = await person(t);
      const a = await person(t);
      const b = await person(t);
      const c = await person(t);
      for (const p of [a, b]) await me.api('post', `/users/${p.id}/follow`).expect(200);
      await story(me, await storyMedia(me)).expect(201);
      const sa = (await story(a, await storyMedia(a)).expect(201)).body.data;
      await story(a, await storyMedia(a)).expect(201);
      const sb = (await story(b, await storyMedia(b)).expect(201)).body.data;
      await story(c, await storyMedia(c)).expect(201); // not followed

      let tray = (await me.api('get', '/stories/tray').expect(200)).body.data;
      expect(tray.map((x: { author: { id: string } }) => x.author.id)).toEqual([me.id, b.id, a.id]);
      expect(tray.find((x: { isMe: boolean }) => x.isMe)).toMatchObject({
        count: 1,
        hasUnseen: true,
      });
      expect(tray.find((x: { author: { id: string } }) => x.author.id === a.id)).toMatchObject({
        count: 2,
        hasUnseen: true,
      });

      await me.api('post', `/stories/${sb.id}/view`).expect(200);
      tray = (await me.api('get', '/stories/tray').expect(200)).body.data;
      // b is now seen, so a (unseen) comes before it.
      expect(tray.map((x: { author: { id: string } }) => x.author.id)).toEqual([me.id, a.id, b.id]);
      expect(tray.find((x: { author: { id: string } }) => x.author.id === b.id).hasUnseen).toBe(
        false,
      );
      void sa;
    });

    it('counts a viewer once, ignores the author’s own views, and tells only the author who', async () => {
      const author = await person(t);
      const f1 = await person(t);
      const f2 = await person(t);
      for (const f of [f1, f2]) await f.api('post', `/users/${author.id}/follow`).expect(200);
      const s = (await story(author, await storyMedia(author)).expect(201)).body.data;

      await f1.api('post', `/stories/${s.id}/view`).expect(200);
      await f1.api('post', `/stories/${s.id}/view`).expect(200);
      await Promise.all([
        f2.api('post', `/stories/${s.id}/view`),
        f2.api('post', `/stories/${s.id}/view`),
      ]);
      await author.api('post', `/stories/${s.id}/view`).expect(200);

      const mine = (await author.api('get', `/profiles/${author.username}/stories`).expect(200))
        .body.data[0];
      expect(mine.viewsCount).toBe(2);
      const viewers = await author.api('get', `/stories/${s.id}/viewers`).expect(200);
      expect(viewers.body.data.map((v: { id: string }) => v.id).sort()).toEqual(
        [f1.id, f2.id].sort(),
      );
      await f1.api('get', `/stories/${s.id}/viewers`).expect(404);
      const theirs = (await f1.api('get', `/profiles/${author.username}/stories`).expect(200)).body
        .data[0];
      expect(theirs.viewer.seen).toBe(true);
      expect(theirs).not.toHaveProperty('viewsCount');
      const row = await t.db.query<{ views: number; n: string }>(
        'SELECT views_count AS views, (SELECT count(*) FROM story_views WHERE story_id = s.id) AS n FROM stories s WHERE s.id = $1',
        [s.id],
      );
      expect(row.rows[0]?.views).toBe(Number(row.rows[0]?.n));
    });

    it('is hidden across blocks and from those who cannot see it, and can be deleted by its author', async () => {
      const author = await person(t);
      const f = await person(t);
      const closeFriend = await person(t);
      for (const p of [f, closeFriend])
        await p.api('post', `/users/${author.id}/follow`).expect(200);
      await author.api('put', `/users/me/close-friends/${closeFriend.id}`).expect(200);
      const normal = (await story(author, await storyMedia(author)).expect(201)).body.data;
      const close = (
        await story(author, await storyMedia(author), { visibility: 'CLOSE_FRIENDS' }).expect(201)
      ).body.data;

      expect(
        (await f.api('get', `/profiles/${author.username}/stories`).expect(200)).body.data.map(
          (s: { id: string }) => s.id,
        ),
      ).toEqual([normal.id]);
      expect(
        (await closeFriend.api('get', `/profiles/${author.username}/stories`).expect(200)).body
          .data,
      ).toHaveLength(2);
      await f.api('post', `/stories/${close.id}/view`).expect(404);

      await author.api('post', `/users/${f.id}/block`).expect(200);
      await f.api('get', `/profiles/${author.username}/stories`).expect(404);
      await f.api('post', `/stories/${normal.id}/view`).expect(404);

      await f.api('delete', `/stories/${normal.id}`).expect(404);
      await author.api('delete', `/stories/${normal.id}`).expect(204);
      await author.api('delete', `/stories/${normal.id}`).expect(204);
      expect(
        (
          await closeFriend.api('get', `/profiles/${author.username}/stories`).expect(200)
        ).body.data.map((s: { id: string }) => s.id),
      ).toEqual([close.id]);
    });

    it('stays unseen while held for review', async () => {
      const author = await person(t);
      const f = await person(t);
      await f.api('post', `/users/${author.id}/follow`).expect(200);
      const pending = await insertMedia(t, author.id, { purpose: 'STORY', moderation: 'PENDING' });
      const s = (await story(author, pending).expect(201)).body.data;
      expect(s.moderation).toEqual({ status: 'PENDING', held: true });
      expect(
        (await f.api('get', `/profiles/${author.username}/stories`).expect(200)).body.data,
      ).toEqual([]);
      expect(
        (await author.api('get', `/profiles/${author.username}/stories`).expect(200)).body.data,
      ).toHaveLength(1);
    });
  });
});
