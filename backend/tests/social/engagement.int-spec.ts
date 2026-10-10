import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV } from '../support/auth.js';
import { engagementAgrees, insertReel, makePost, person, type Person } from '../support/social.js';

describe('likes, saves and shares', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  const postOf = async (p: Person, over: Record<string, unknown> = {}) =>
    (await makePost(p, over)).id;
  const likesNotes = async (p: Person) =>
    (await p.api('get', '/notifications').expect(200)).body.data.filter(
      (n: { type: string }) => n.type === 'LIKE',
    );

  describe('likes', () => {
    it('like once, show it to me, count it, and tell the author', async () => {
      const author = await person(t);
      const fan = await person(t);
      const id = await postOf(author);

      const res = await fan.api('post', `/posts/${id}/like`).expect(200);
      expect(res.body.data).toEqual({ liked: true, likesCount: 1 });
      const seen = await fan.api('get', `/posts/${id}`).expect(200);
      expect(seen.body.data.viewer.liked).toBe(true);
      expect(seen.body.data.counts.likes).toBe(1);
      // Someone else sees the count, not my like.
      const other = await person(t);
      const theirs = await other.api('get', `/posts/${id}`).expect(200);
      expect(theirs.body.data).toMatchObject({ counts: { likes: 1 }, viewer: { liked: false } });

      const notes = await likesNotes(author);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ title: 'New like', data: { postId: id, userId: fan.id } });
      // The words name the person and the thing, never the post's text.
      expect(JSON.stringify(notes[0])).not.toContain('A post');
    });

    it('does nothing the second time, and does not tell the author again after a like-unlike-like', async () => {
      const author = await person(t);
      const fan = await person(t);
      const id = await postOf(author);
      await fan.api('post', `/posts/${id}/like`).expect(200);
      expect((await fan.api('post', `/posts/${id}/like`).expect(200)).body.data.likesCount).toBe(1);
      await fan.api('delete', `/posts/${id}/like`).expect(200);
      await fan.api('post', `/posts/${id}/like`).expect(200);
      expect(await likesNotes(author)).toHaveLength(1);
      expect((await engagementAgrees(t, id)).ok).toBe(true);
    });

    it('can be taken back, repeatedly, without going below zero', async () => {
      const author = await person(t);
      const fan = await person(t);
      const id = await postOf(author);
      await fan.api('post', `/posts/${id}/like`).expect(200);
      expect((await fan.api('delete', `/posts/${id}/like`).expect(200)).body.data).toEqual({
        liked: false,
        likesCount: 0,
      });
      expect((await fan.api('delete', `/posts/${id}/like`).expect(200)).body.data.likesCount).toBe(
        0,
      );
      expect((await engagementAgrees(t, id)).ok).toBe(true);
    });

    it('lets people like their own post, silently', async () => {
      const author = await person(t);
      const id = await postOf(author);
      expect((await author.api('post', `/posts/${id}/like`).expect(200)).body.data.likesCount).toBe(
        1,
      );
      expect(await likesNotes(author)).toHaveLength(0);
    });

    it('is refused for a post the person cannot see, a missing one and a malformed id', async () => {
      const author = await person(t);
      const stranger = await person(t);
      const hidden = await postOf(author, { visibility: 'FOLLOWERS' });
      await stranger.api('post', `/posts/${hidden}/like`).expect(404);
      await stranger.api('post', '/posts/01990000-0000-7000-8000-000000000001/like').expect(404);
      await stranger.api('post', '/posts/nope/like').expect(400);
      await t.http.post(`/api/v1/posts/${hidden}/like`).expect(401);
      // A block closes it too.
      const open = await postOf(author);
      await author.api('post', `/users/${stranger.id}/block`).expect(200);
      await stranger.api('post', `/posts/${open}/like`).expect(404);
    });

    it('does not let a stranger learn anything from the answer', async () => {
      const author = await person(t);
      const stranger = await person(t);
      const hidden = await postOf(author, { visibility: 'PRIVATE' });
      const missing = await stranger
        .api('post', '/posts/01990000-0000-7000-8000-000000000001/like')
        .expect(404);
      const refused = await stranger.api('post', `/posts/${hidden}/like`).expect(404);
      expect(refused.body.error.message).toBe(missing.body.error.message);
    });

    it('counts a crowd arriving together, and one person pressing many times', async () => {
      const author = await person(t);
      const id = await postOf(author);
      const crowd: Person[] = [];
      for (let i = 0; i < 8; i++) crowd.push(await person(t));
      await Promise.all(crowd.map((p) => p.api('post', `/posts/${id}/like`)));
      const solo = crowd[0]!;
      await Promise.all(Array.from({ length: 6 }, () => solo.api('post', `/posts/${id}/like`)));
      const check = await engagementAgrees(t, id);
      expect(check.ok, check.detail).toBe(true);
      expect((await author.api('get', `/posts/${id}`).expect(200)).body.data.counts.likes).toBe(8);
    });

    it('stays consistent through a storm of likes and unlikes', async () => {
      const author = await person(t);
      const id = await postOf(author);
      const crowd: Person[] = [];
      for (let i = 0; i < 6; i++) crowd.push(await person(t));
      await Promise.all(
        crowd.flatMap((p) => [
          p.api('post', `/posts/${id}/like`),
          p.api('delete', `/posts/${id}/like`),
          p.api('post', `/posts/${id}/like`),
        ]),
      );
      const check = await engagementAgrees(t, id);
      expect(check.ok, check.detail).toBe(true);
    });

    it('works the same on reels, and only on published ones', async () => {
      const author = await person(t);
      const fan = await person(t);
      const reel = await insertReel(t, author.id);
      const draft = await insertReel(t, author.id, { published: false });
      const held = await insertReel(t, author.id, { moderation: 'PENDING' });
      expect((await fan.api('post', `/reels/${reel}/like`).expect(200)).body.data).toEqual({
        liked: true,
        likesCount: 1,
      });
      await fan.api('post', `/reels/${reel}/like`).expect(200);
      await fan.api('post', `/reels/${draft}/like`).expect(404);
      await fan.api('post', `/reels/${held}/like`).expect(404);
      expect(
        (await fan.api('delete', `/reels/${reel}/like`).expect(200)).body.data.likesCount,
      ).toBe(0);
      const rows = await t.db.query<{ n: string; c: number }>(
        'SELECT (SELECT count(*) FROM likes WHERE reel_id = r.id) AS n, r.likes_count AS c FROM reels r WHERE r.id = $1',
        [reel],
      );
      expect(Number(rows.rows[0]?.n)).toBe(rows.rows[0]?.c);
    });
  });

  describe('saves', () => {
    it('save, repeat safely, and appear in my saved list with the post as I can see it', async () => {
      const author = await person(t);
      const me = await person(t);
      const id = await postOf(author, { caption: 'worth keeping' });
      expect((await me.api('post', `/posts/${id}/save`).expect(200)).body.data).toEqual({
        saved: true,
        savesCount: 1,
      });
      expect((await me.api('post', `/posts/${id}/save`).expect(200)).body.data.savesCount).toBe(1);
      const saved = await me.api('get', '/users/me/saved').expect(200);
      expect(saved.body.data).toHaveLength(1);
      expect(saved.body.data[0]).toMatchObject({
        kind: 'post',
        post: { id, caption: 'worth keeping', viewer: { saved: true } },
      });
      expect((await engagementAgrees(t, id)).ok).toBe(true);

      expect((await me.api('delete', `/posts/${id}/save`).expect(200)).body.data).toEqual({
        saved: false,
        savesCount: 0,
      });
      expect((await me.api('delete', `/posts/${id}/save`).expect(200)).body.data.savesCount).toBe(
        0,
      );
      expect((await me.api('get', '/users/me/saved').expect(200)).body.data).toEqual([]);
    });

    it('is private to the person who saved', async () => {
      const author = await person(t);
      const me = await person(t);
      const other = await person(t);
      const id = await postOf(author);
      await me.api('post', `/posts/${id}/save`).expect(200);
      expect((await other.api('get', '/users/me/saved').expect(200)).body.data).toEqual([]);
      // The author sees a count, not who.
      const seen = await author.api('get', `/posts/${id}`).expect(200);
      expect(seen.body.data.counts.saves).toBe(1);
      expect(JSON.stringify(seen.body)).not.toContain(me.username);
    });

    it('drops what I can no longer see: deleted, hidden, or from someone who blocked me', async () => {
      const author = await person(t);
      const me = await person(t);
      const keep = await postOf(author);
      const gone = await postOf(author);
      const hidden = await postOf(author);
      for (const id of [keep, gone, hidden]) await me.api('post', `/posts/${id}/save`).expect(200);

      await author.api('delete', `/posts/${gone}`).expect(204);
      await author
        .api('patch', `/posts/${hidden}`, { body: { visibility: 'PRIVATE' } })
        .expect(200);
      const list = await me.api('get', '/users/me/saved').expect(200);
      expect(list.body.data.map((s: { post: { id: string } }) => s.post.id)).toEqual([keep]);

      await author.api('post', `/users/${me.id}/block`).expect(200);
      expect((await me.api('get', '/users/me/saved').expect(200)).body.data).toEqual([]);
    });

    it('pages newest first', async () => {
      const author = await person(t);
      const me = await person(t);
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const id = await postOf(author);
        ids.push(id);
        await me.api('post', `/posts/${id}/save`).expect(200);
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const res = await me
          .api('get', '/users/me/saved', { query: { limit: 2, ...(cursor ? { cursor } : {}) } })
          .expect(200);
        seen.push(...res.body.data.map((s: { post: { id: string } }) => s.post.id));
        cursor = res.body.meta.hasMore ? res.body.meta.nextCursor : undefined;
      } while (cursor);
      expect(seen).toEqual(ids.slice().reverse());
    });

    it('is refused for what I cannot see', async () => {
      const author = await person(t);
      const stranger = await person(t);
      const hidden = await postOf(author, { visibility: 'PRIVATE' });
      await stranger.api('post', `/posts/${hidden}/save`).expect(404);
    });
  });

  describe('shares', () => {
    it('give the link for a public post and count a person’s share once a day', async () => {
      const author = await person(t);
      const a = await person(t);
      const b = await person(t);
      const id = await postOf(author);
      const one = await a
        .api('post', `/posts/${id}/share`, { body: { channel: 'LINK' } })
        .expect(200);
      expect(one.body.data).toEqual({ sharesCount: 1, url: `https://blocks.example/p/${id}` });
      expect(
        (await a.api('post', `/posts/${id}/share`, { body: { channel: 'EXTERNAL' } }).expect(200))
          .body.data.sharesCount,
      ).toBe(1);
      expect(
        (await b.api('post', `/posts/${id}/share`, { body: { channel: 'MESSAGE' } }).expect(200))
          .body.data.sharesCount,
      ).toBe(2);
      const rows = await t.db.query<{ n: string }>(
        'SELECT count(*) AS n FROM shares WHERE post_id = $1',
        [id],
      );
      expect(Number(rows.rows[0]?.n)).toBe(2);

      // A day later it counts again.
      await t.db.query(
        "UPDATE shares SET created_at = now() - interval '2 days' WHERE post_id = $1 AND user_id = $2",
        [id, a.id],
      );
      expect(
        (await a.api('post', `/posts/${id}/share`, { body: { channel: 'LINK' } }).expect(200)).body
          .data.sharesCount,
      ).toBe(3);
    });

    it('offers no link for a post only some people can open', async () => {
      const author = await person(t);
      const follower = await person(t);
      await follower.api('post', `/users/${author.id}/follow`).expect(200);
      const id = await postOf(author, { visibility: 'FOLLOWERS' });
      const res = await follower
        .api('post', `/posts/${id}/share`, { body: { channel: 'LINK' } })
        .expect(200);
      expect(res.body.data.url).toBeNull();
      const privateOwner = await person(t, { private: true });
      const pub = await postOf(privateOwner, { visibility: 'PUBLIC' });
      await follower.api('post', `/users/${privateOwner.id}/follow`).expect(200);
      await privateOwner
        .api('post', `/users/me/follow-requests/${follower.id}/approve`)
        .expect(200);
      expect(
        (
          await follower
            .api('post', `/posts/${pub}/share`, { body: { channel: 'LINK' } })
            .expect(200)
        ).body.data.url,
      ).toBeNull();
    });

    it('respects the author turning sharing off, for everyone but the author', async () => {
      const author = await person(t);
      const fan = await person(t);
      const id = await postOf(author, { allowSharing: false });
      const refused = await fan
        .api('post', `/posts/${id}/share`, { body: { channel: 'LINK' } })
        .expect(403);
      expect(refused.body.error.code).toBe('FORBIDDEN');
      await author.api('post', `/posts/${id}/share`, { body: { channel: 'LINK' } }).expect(200);
    });

    it('takes only real channels, and not for what you cannot see', async () => {
      const author = await person(t);
      const fan = await person(t);
      const id = await postOf(author);
      for (const channel of ['REPOST', 'SMOKE_SIGNAL', undefined]) {
        await fan
          .api('post', `/posts/${id}/share`, { body: channel ? { channel } : {} })
          .expect(400);
      }
      const hidden = await postOf(author, { visibility: 'PRIVATE' });
      await fan.api('post', `/posts/${hidden}/share`, { body: { channel: 'LINK' } }).expect(404);
    });
  });
});
