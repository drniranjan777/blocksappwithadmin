import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SystemSettingsService } from '../../src/common/settings/system-settings.service.js';
import { COMMENTS_PER_HOUR } from '../../src/social/comments/comments.service.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, freshName } from '../support/auth.js';
import { engagementAgrees, insertReel, makePost, person, type Person } from '../support/social.js';

describe('comments', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  const comment = (p: Person, postId: string, body: string, parentId?: string) =>
    p.api('post', `/posts/${postId}/comments`, {
      body: { body, ...(parentId ? { parentId } : {}) },
    });
  const notes = async (p: Person, type: string) =>
    (await p.api('get', '/notifications').expect(200)).body.data.filter(
      (n: { type: string }) => n.type === type,
    );
  const counts = async (p: Person, postId: string) =>
    (await p.api('get', `/posts/${postId}`).expect(200)).body.data.counts;

  describe('writing', () => {
    it('adds a comment, counts it, and tells the author once', async () => {
      const author = await person(t);
      const fan = await person(t);
      const { id } = await makePost(author);
      const res = await comment(fan, id, '  Nice one!  ').expect(201);
      expect(res.body.data).toMatchObject({
        body: 'Nice one!',
        parentId: null,
        likesCount: 0,
        repliesCount: 0,
        viewer: { liked: false, isAuthor: true },
      });
      expect(res.body.data.author).toMatchObject({ id: fan.id, username: fan.username });
      expect((await counts(author, id)).comments).toBe(1);

      const told = await notes(author, 'COMMENT');
      expect(told).toHaveLength(1);
      expect(told[0]).toMatchObject({
        title: 'New comment',
        data: { postId: id, commentId: res.body.data.id, userId: fan.id },
      });
      expect(JSON.stringify(told[0])).not.toContain('Nice one');
      expect((await engagementAgrees(t, id)).ok).toBe(true);
    });

    it('does not notify the author about their own comment', async () => {
      const author = await person(t);
      const { id } = await makePost(author);
      await comment(author, id, 'first!').expect(201);
      expect(await notes(author, 'COMMENT')).toHaveLength(0);
    });

    it('validates the text', async () => {
      const author = await person(t);
      const { id } = await makePost(author);
      await comment(author, id, '').expect(400);
      await comment(author, id, '   \n  ').expect(400);
      await comment(author, id, 'x'.repeat(1001)).expect(400);
      await author.api('post', `/posts/${id}/comments`, { body: {} }).expect(400);
      await author
        .api('post', `/posts/${id}/comments`, { body: { body: 'hi', status: 'VISIBLE' } })
        .expect(400);
      await author
        .api('post', `/posts/${id}/comments`, { body: { body: 'hi', authorId: author.id } })
        .expect(400);
      const many = Array.from({ length: 21 }, (_, i) => `@person_${i}x`).join(' ');
      await comment(author, id, many).expect(400);
    });

    it('is refused for what the person cannot see, and when comments are off', async () => {
      const author = await person(t);
      const stranger = await person(t);
      const hidden = await makePost(author, { visibility: 'PRIVATE' });
      await comment(stranger, hidden.id, 'let me in').expect(404);
      await comment(stranger, '01990000-0000-7000-8000-000000000001', 'x').expect(404);

      const quiet = await makePost(author, { allowComments: false });
      const refused = await comment(stranger, quiet.id, 'hello?').expect(403);
      expect(refused.body.error.code).toBe('FORBIDDEN');
      await comment(author, quiet.id, 'the author may still').expect(201);

      const open = await makePost(author);
      await author.api('post', `/users/${stranger.id}/block`).expect(200);
      await comment(stranger, open.id, 'blocked').expect(404);
    });

    it('follows the author’s "who can comment" choice', async () => {
      const author = await person(t);
      const follower = await person(t);
      const stranger = await person(t);
      await follower.api('post', `/users/${author.id}/follow`).expect(200);
      const { id } = await makePost(author);

      await author
        .api('patch', '/users/me/settings', { body: { whoCanComment: 'followers' } })
        .expect(200);
      await comment(follower, id, 'ok').expect(201);
      const refused = await comment(stranger, id, 'no').expect(403);
      expect(refused.body.error.message).toMatch(/followers/i);

      await author
        .api('patch', '/users/me/settings', { body: { whoCanComment: 'nobody' } })
        .expect(200);
      await comment(follower, id, 'closed').expect(403);
      await comment(author, id, 'but I can').expect(201);

      await author
        .api('patch', '/users/me/settings', { body: { whoCanComment: 'everyone' } })
        .expect(200);
      await comment(stranger, id, 'back to normal').expect(201);
    });

    it('slows a flood: too many in an hour is refused', async () => {
      const author = await person(t);
      const me = await person(t);
      const { id } = await makePost(author);
      await t.db.query(
        `INSERT INTO comments (id, post_id, author_id, body)
         SELECT gen_random_uuid(), $2::uuid, $1::uuid, 'bulk ' || g FROM generate_series(1, $3::int) g`,
        [me.id, id, COMMENTS_PER_HOUR],
      );
      const res = await comment(me, id, 'one too many').expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });

    it('is safe to retry with an Idempotency-Key', async () => {
      const author = await person(t);
      const fan = await person(t);
      const { id } = await makePost(author);
      const key = `key-${freshName('c')}`;
      const one = await comment(fan, id, 'once').set('Idempotency-Key', key).expect(201);
      const two = await comment(fan, id, 'once').set('Idempotency-Key', key).expect(201);
      expect(two.body.data.id).toBe(one.body.data.id);
      expect((await counts(author, id)).comments).toBe(1);
      await comment(fan, id, 'something else').set('Idempotency-Key', key).expect(409);
    });
  });

  describe('replies', () => {
    it('count under their parent, notify its author, and read oldest first', async () => {
      const author = await person(t);
      const a = await person(t);
      const b = await person(t);
      const { id } = await makePost(author);
      const top = (await comment(a, id, 'top').expect(201)).body.data.id;
      const r1 = (await comment(b, id, 'first reply', top).expect(201)).body.data;
      const r2 = (await comment(author, id, 'second reply', top).expect(201)).body.data;
      expect(r1.parentId).toBe(top);

      const parent = await author.api('get', `/posts/${id}/comments`).expect(200);
      expect(parent.body.data).toHaveLength(1);
      expect(parent.body.data[0]).toMatchObject({ id: top, repliesCount: 2 });
      expect((await counts(author, id)).comments).toBe(3);

      const replies = await author.api('get', `/comments/${top}/replies`).expect(200);
      expect(replies.body.data.map((c: { id: string }) => c.id)).toEqual([r1.id, r2.id]);

      const told = await notes(a, 'COMMENT');
      expect(told.map((n: { title: string }) => n.title)).toContain('New reply');
      // The post's author, also the parent's... is told once for the same comment.
      expect((await engagementAgrees(t, id)).ok).toBe(true);
    });

    it('attach to the comment above when answering a reply', async () => {
      const author = await person(t);
      const a = await person(t);
      const { id } = await makePost(author);
      const top = (await comment(a, id, 'top').expect(201)).body.data.id;
      const reply = (await comment(author, id, 'reply', top).expect(201)).body.data.id;
      const deep = (await comment(a, id, 'reply to the reply', reply).expect(201)).body.data;
      expect(deep.parentId).toBe(top);
      expect(
        (await author.api('get', `/comments/${top}/replies`).expect(200)).body.data,
      ).toHaveLength(2);
    });

    it('need a real parent on the same post', async () => {
      const author = await person(t);
      const { id } = await makePost(author);
      const other = await makePost(author);
      const elsewhere = (await comment(author, other.id, 'on another post').expect(201)).body.data
        .id;
      for (const parent of ['01990000-0000-7000-8000-000000000001', elsewhere]) {
        const res = await comment(author, id, 'orphan', parent).expect(400);
        expect(JSON.stringify(res.body.error.details)).toContain('parentId');
      }
      await comment(author, id, 'x', 'nope').expect(400);
    });

    it('tell mentioned people, once each, and not people on either side of a block', async () => {
      const author = await person(t);
      const writer = await person(t);
      const friend = await person(t);
      const blocked = await person(t);
      await writer.api('post', `/users/${blocked.id}/block`).expect(200);
      const { id } = await makePost(author);
      await comment(
        writer,
        id,
        `hi @${friend.username} @${friend.username} @${blocked.username}`,
      ).expect(201);
      expect(await notes(friend, 'MENTION')).toHaveLength(1);
      expect(await notes(blocked, 'MENTION')).toHaveLength(0);
    });
  });

  describe('reading', () => {
    it('lists newest first and pages without gaps or repeats', async () => {
      const author = await person(t);
      const { id } = await makePost(author);
      const made: string[] = [];
      for (let i = 0; i < 7; i++)
        made.push((await comment(author, id, `comment ${i}`).expect(201)).body.data.id);
      const viewer = await person(t);
      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const res = await viewer
          .api('get', `/posts/${id}/comments`, {
            query: { limit: 3, ...(cursor ? { cursor } : {}) },
          })
          .expect(200);
        seen.push(...res.body.data.map((c: { id: string }) => c.id));
        cursor = res.body.meta.hasMore ? res.body.meta.nextCursor : undefined;
        pages++;
      } while (cursor && pages < 10);
      expect(seen).toEqual(made.slice().reverse());
      expect(pages).toBe(3);
    });

    it('leaves out comments from people on either side of a block with the reader', async () => {
      const author = await person(t);
      const reader = await person(t);
      const blockedByMe = await person(t);
      const blockedMe = await person(t);
      const fine = await person(t);
      const { id } = await makePost(author);
      await reader.api('post', `/users/${blockedByMe.id}/block`).expect(200);
      await blockedMe.api('post', `/users/${reader.id}/block`).expect(200);
      for (const p of [blockedByMe, blockedMe, fine])
        await comment(p, id, `from ${p.username}`).expect(201);

      const res = await reader.api('get', `/posts/${id}/comments`).expect(200);
      expect(res.body.data.map((c: { author: { id: string } }) => c.author.id)).toEqual([fine.id]);
    });

    it('is only for those who can see the post', async () => {
      const author = await person(t);
      const stranger = await person(t);
      const { id } = await makePost(author, { visibility: 'FOLLOWERS' });
      await comment(author, id, 'hello followers').expect(201);
      await stranger.api('get', `/posts/${id}/comments`).expect(404);
      await stranger.api('get', '/posts/01990000-0000-7000-8000-000000000001/comments').expect(404);
    });

    it('tells me which are mine and which I liked', async () => {
      const author = await person(t);
      const fan = await person(t);
      const { id } = await makePost(author);
      const mine = (await comment(fan, id, 'mine').expect(201)).body.data.id;
      const theirs = (await comment(author, id, 'theirs').expect(201)).body.data.id;
      await fan.api('post', `/comments/${theirs}/like`).expect(200);
      const res = await fan.api('get', `/posts/${id}/comments`).expect(200);
      const byId = new Map<string, any>(res.body.data.map((c: { id: string }) => [c.id, c]));
      expect(byId.get(mine).viewer).toEqual({ liked: false, isAuthor: true });
      expect(byId.get(theirs).viewer).toEqual({ liked: true, isAuthor: false });
      expect(byId.get(theirs).likesCount).toBe(1);
    });
  });

  describe('held comments', () => {
    beforeAll(async () => {
      await t.db.prisma.systemSetting.upsert({
        where: { key: 'moderation.blocked_terms' },
        create: { key: 'moderation.blocked_terms', value: ['forbiddenword'] },
        update: { value: ['forbiddenword'] },
      });
      t.app.get(SystemSettingsService, { strict: false }).invalidate();
    });

    it('stay with their writer until a person has looked, uncounted and unannounced', async () => {
      const author = await person(t);
      const writer = await person(t);
      const reader = await person(t);
      const { id } = await makePost(author);
      const held = (await comment(writer, id, 'this has forbiddenword in it').expect(201)).body
        .data;
      expect(held.held).toBe(true);

      expect((await counts(author, id)).comments).toBe(0);
      expect(await notes(author, 'COMMENT')).toHaveLength(0);
      const forReader = await reader.api('get', `/posts/${id}/comments`).expect(200);
      expect(forReader.body.data).toEqual([]);
      const forWriter = await writer.api('get', `/posts/${id}/comments`).expect(200);
      expect(forWriter.body.data.map((c: { id: string }) => c.id)).toEqual([held.id]);
      await reader.api('post', `/comments/${held.id}/like`).expect(404);
      expect((await engagementAgrees(t, id)).ok).toBe(true);
    });
  });

  describe('deleting', () => {
    it('lets the writer or the post’s author remove a comment, and nobody else', async () => {
      const author = await person(t);
      const writer = await person(t);
      const other = await person(t);
      const { id } = await makePost(author);
      const a = (await comment(writer, id, 'a').expect(201)).body.data.id;
      const b = (await comment(other, id, 'b').expect(201)).body.data.id;
      expect((await counts(author, id)).comments).toBe(2);

      await other.api('delete', `/comments/${a}`).expect(404);
      await writer.api('delete', `/comments/${a}`).expect(204);
      await author.api('delete', `/comments/${b}`).expect(204);
      expect((await counts(author, id)).comments).toBe(0);
      expect((await author.api('get', `/posts/${id}/comments`).expect(200)).body.data).toEqual([]);
      expect((await engagementAgrees(t, id)).ok).toBe(true);
    });

    it('is repeatable and quiet about comments that never existed', async () => {
      const author = await person(t);
      const { id } = await makePost(author);
      const c = (await comment(author, id, 'x').expect(201)).body.data.id;
      await author.api('delete', `/comments/${c}`).expect(204);
      await author.api('delete', `/comments/${c}`).expect(204);
      await author.api('delete', '/comments/01990000-0000-7000-8000-000000000001').expect(204);
      await author.api('delete', '/comments/nope').expect(400);
      expect((await counts(author, id)).comments).toBe(0);
    });

    it('takes the replies of a comment with it, and fixes every count', async () => {
      const author = await person(t);
      const a = await person(t);
      const b = await person(t);
      const { id } = await makePost(author);
      const top = (await comment(a, id, 'top').expect(201)).body.data.id;
      await comment(b, id, 'r1', top).expect(201);
      await comment(a, id, 'r2', top).expect(201);
      const survivor = (await comment(b, id, 'another top').expect(201)).body.data.id;
      expect((await counts(author, id)).comments).toBe(4);

      await a.api('delete', `/comments/${top}`).expect(204);
      expect((await counts(author, id)).comments).toBe(1);
      expect(
        (await author.api('get', `/posts/${id}/comments`).expect(200)).body.data.map(
          (c: { id: string }) => c.id,
        ),
      ).toEqual([survivor]);
      await author.api('get', `/comments/${top}/replies`).expect(404);
      expect((await engagementAgrees(t, id)).ok).toBe(true);
    });

    it('updates the parent when only a reply goes', async () => {
      const author = await person(t);
      const a = await person(t);
      const { id } = await makePost(author);
      const top = (await comment(a, id, 'top').expect(201)).body.data.id;
      const reply = (await comment(author, id, 'reply', top).expect(201)).body.data.id;
      await author.api('delete', `/comments/${reply}`).expect(204);
      const list = await author.api('get', `/posts/${id}/comments`).expect(200);
      expect(list.body.data[0]).toMatchObject({ id: top, repliesCount: 0 });
      expect((await counts(author, id)).comments).toBe(1);
    });

    it('keeps counts exact when deletes race', async () => {
      const author = await person(t);
      const a = await person(t);
      const { id } = await makePost(author);
      const ids: string[] = [];
      for (let i = 0; i < 6; i++)
        ids.push((await comment(a, id, `c${i}`).expect(201)).body.data.id);
      await Promise.all(
        ids.flatMap((c) => [
          a.api('delete', `/comments/${c}`),
          author.api('delete', `/comments/${c}`),
        ]),
      );
      const check = await engagementAgrees(t, id);
      expect(check.ok, check.detail).toBe(true);
      expect((await counts(author, id)).comments).toBe(0);
    });
  });

  describe('liking a comment', () => {
    it('counts once per person, can be taken back, and needs the comment to be visible', async () => {
      const author = await person(t);
      const fan = await person(t);
      const other = await person(t);
      const { id } = await makePost(author);
      const c = (await comment(author, id, 'like me').expect(201)).body.data.id;
      expect((await fan.api('post', `/comments/${c}/like`).expect(200)).body.data).toEqual({
        liked: true,
        likesCount: 1,
      });
      expect((await fan.api('post', `/comments/${c}/like`).expect(200)).body.data.likesCount).toBe(
        1,
      );
      expect(
        (await other.api('post', `/comments/${c}/like`).expect(200)).body.data.likesCount,
      ).toBe(2);
      expect((await fan.api('delete', `/comments/${c}/like`).expect(200)).body.data).toEqual({
        liked: false,
        likesCount: 1,
      });
      expect(
        (await fan.api('delete', `/comments/${c}/like`).expect(200)).body.data.likesCount,
      ).toBe(1);

      const hidden = await makePost(author, { visibility: 'PRIVATE' });
      const inHidden = (await comment(author, hidden.id, 'private thought').expect(201)).body.data
        .id;
      await fan.api('post', `/comments/${inHidden}/like`).expect(404);
      await fan.api('post', '/comments/01990000-0000-7000-8000-000000000001/like').expect(404);
    });

    it('stays exact under parallel likes', async () => {
      const author = await person(t);
      const { id } = await makePost(author);
      const c = (await comment(author, id, 'popular').expect(201)).body.data.id;
      const crowd: Person[] = [];
      for (let i = 0; i < 6; i++) crowd.push(await person(t));
      await Promise.all(
        [...crowd, crowd[0]!, crowd[0]!].map((p) => p.api('post', `/comments/${c}/like`)),
      );
      const row = await t.db.query<{ n: string; c: number }>(
        'SELECT (SELECT count(*) FROM likes WHERE comment_id = c.id) AS n, c.likes_count AS c FROM comments c WHERE c.id = $1',
        [c],
      );
      expect(Number(row.rows[0]?.n)).toBe(row.rows[0]?.c);
      expect(row.rows[0]?.c).toBe(6);
    });
  });

  describe('on reels', () => {
    it('work the same way', async () => {
      const author = await person(t);
      const fan = await person(t);
      const reel = await insertReel(t, author.id);
      const draft = await insertReel(t, author.id, { published: false });
      const res = await fan
        .api('post', `/reels/${reel}/comments`, { body: { body: 'great reel' } })
        .expect(201);
      await author
        .api('post', `/reels/${reel}/comments`, {
          body: { body: 'thanks', parentId: res.body.data.id },
        })
        .expect(201);
      await fan
        .api('post', `/reels/${draft}/comments`, { body: { body: 'too early' } })
        .expect(404);

      const list = await fan.api('get', `/reels/${reel}/comments`).expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].repliesCount).toBe(1);
      const row = await t.db.query<{ c: number }>(
        'SELECT comments_count AS c FROM reels WHERE id = $1',
        [reel],
      );
      expect(row.rows[0]?.c).toBe(2);
      await fan.api('delete', `/comments/${res.body.data.id}`).expect(204);
      const after = await t.db.query<{ c: number }>(
        'SELECT comments_count AS c FROM reels WHERE id = $1',
        [reel],
      );
      expect(after.rows[0]?.c).toBe(0);
    });
  });
});
