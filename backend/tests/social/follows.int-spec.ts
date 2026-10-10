import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FOLLOWS_PER_HOUR } from '../../src/social/follows/follows.service.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, freshName } from '../support/auth.js';
import { countersAgree, person, type Person } from '../support/social.js';

describe('following, requests and blocking', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  /** The follower / following / post counts that `viewer` sees on `target`'s profile. */
  const counts = async (target: Person, viewer: Person) => {
    const res = await viewer.api('get', `/profiles/${target.username}`).expect(200);
    return res.body.data.counts as { followers: number; following: number; posts: number };
  };

  describe('following a public account', () => {
    it('follows at once, counts both sides once, and tells the person', async () => {
      const a = await person(t);
      const b = await person(t);
      const res = await a.api('post', `/users/${b.id}/follow`).expect(200);
      expect(res.body.data).toEqual({ state: 'FOLLOWING', followersCount: 1 });
      expect(await counts(b, a)).toEqual({ followers: 1, following: 0, posts: 0 });
      expect(await counts(a, b)).toEqual({ followers: 0, following: 1, posts: 0 });

      const note = await b.api('get', '/notifications').expect(200);
      const n = note.body.data.find((x: { type: string }) => x.type === 'NEW_FOLLOWER');
      expect(n.title).toBe('New follower');
      expect(n.data).toEqual({ userId: a.id });
      expect((await countersAgree(t, a.id)).ok).toBe(true);
      expect((await countersAgree(t, b.id)).ok).toBe(true);
    });

    it('does nothing the second time, and does not notify again after an unfollow', async () => {
      const a = await person(t);
      const b = await person(t);
      await a.api('post', `/users/${b.id}/follow`).expect(200);
      const again = await a.api('post', `/users/${b.id}/follow`).expect(200);
      expect(again.body.data.followersCount).toBe(1);

      await a.api('delete', `/users/${b.id}/follow`).expect(200);
      await a.api('post', `/users/${b.id}/follow`).expect(200);
      const note = await b.api('get', '/notifications').expect(200);
      expect(
        note.body.data.filter((x: { type: string }) => x.type === 'NEW_FOLLOWER'),
      ).toHaveLength(1);
      expect((await countersAgree(t, b.id)).ok).toBe(true);
    });

    it('unfollows, safely repeated, and the counts return to zero', async () => {
      const a = await person(t);
      const b = await person(t);
      await a.api('post', `/users/${b.id}/follow`).expect(200);
      const first = await a.api('delete', `/users/${b.id}/follow`).expect(200);
      expect(first.body.data.followersCount).toBe(0);
      await a.api('delete', `/users/${b.id}/follow`).expect(200);
      expect(await counts(b, a)).toEqual({ followers: 0, following: 0, posts: 0 });
      // Unfollowing someone never followed is harmless too.
      await a.api('delete', `/users/${(await person(t)).id}/follow`).expect(200);
    });

    it('refuses yourself, strangers who do not exist, and people you blocked', async () => {
      const a = await person(t);
      const b = await person(t);
      const self = await a.api('post', `/users/${a.id}/follow`).expect(400);
      expect(JSON.stringify(self.body.error.details)).toContain('cannot_follow_yourself');
      await a.api('post', '/users/01990000-0000-7000-8000-000000000001/follow').expect(404);
      await a.api('post', '/users/not-a-uuid/follow').expect(400);
      await a.api('post', `/users/${b.id}/block`).expect(200);
      const blocked = await a.api('post', `/users/${b.id}/follow`).expect(409);
      expect(blocked.body.error.code).toBe('CONFLICT');
    });

    it('looks like "not found" to someone who has been blocked, not a refusal', async () => {
      const a = await person(t);
      const b = await person(t);
      await b.api('post', `/users/${a.id}/block`).expect(200);
      const res = await a.api('post', `/users/${b.id}/follow`).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      // Indistinguishable from a person who does not exist.
      const missing = await a
        .api('post', '/users/01990000-0000-7000-8000-000000000001/follow')
        .expect(404);
      expect(res.body.error.message).toBe(missing.body.error.message);
    });

    it('cannot be used to follow a suspended account', async () => {
      const a = await person(t);
      const b = await person(t);
      await t.db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [b.id]);
      await a.api('post', `/users/${b.id}/follow`).expect(404);
    });

    it('stops a runaway: too many new follows in an hour is refused, an old burst is not held against anyone', async () => {
      const a = await person(t);
      const b = await person(t);
      // An hour of frantic following, as real rows (bulk-created accounts followed by `a`).
      await t.db.query(
        `WITH u AS (
           INSERT INTO users (id, username, email, password_hash, updated_at)
           SELECT gen_random_uuid(), 'bulk_' || g || '_' || substr(md5(random()::text), 1, 8),
                  'bulk' || g || '_' || substr(md5(random()::text), 1, 8) || '@x.test', 'x', now()
             FROM generate_series(1, $2::int) g
           RETURNING id)
         INSERT INTO follows (follower_id, followee_id, status)
         SELECT $1::uuid, id, 'ACCEPTED' FROM u`,
        [a.id, FOLLOWS_PER_HOUR],
      );
      const refused = await a.api('post', `/users/${b.id}/follow`).expect(429);
      expect(refused.body.error.code).toBe('RATE_LIMITED');
      expect(refused.headers['retry-after']).toBeDefined();

      await t.db.query(
        "UPDATE follows SET created_at = now() - interval '2 hours' WHERE follower_id = $1",
        [a.id],
      );
      await a.api('post', `/users/${b.id}/follow`).expect(200);
    }, 60_000);
  });

  describe('following a private account', () => {
    it('sends a request, changes no counts, and waits', async () => {
      const owner = await person(t, { private: true });
      const a = await person(t);
      const res = await a.api('post', `/users/${owner.id}/follow`).expect(200);
      expect(res.body.data.state).toBe('REQUESTED');
      expect(await counts(owner, a)).toEqual({ followers: 0, following: 0, posts: 0 });

      const list = await owner.api('get', '/users/me/follow-requests').expect(200);
      expect(list.body.data.map((u: { id: string }) => u.id)).toEqual([a.id]);
      expect(list.body.data[0]).toHaveProperty('requestedAt');
      const note = await owner.api('get', '/notifications').expect(200);
      expect(note.body.data.some((x: { type: string }) => x.type === 'FOLLOW_REQUEST')).toBe(true);
    });

    it('lets the owner approve, counting once, and tells the requester', async () => {
      const owner = await person(t, { private: true });
      const a = await person(t);
      await a.api('post', `/users/${owner.id}/follow`).expect(200);
      await owner.api('post', `/users/me/follow-requests/${a.id}/approve`).expect(200);
      expect(await counts(owner, a)).toEqual({ followers: 1, following: 0, posts: 0 });
      expect(await counts(a, owner)).toEqual({ followers: 0, following: 1, posts: 0 });
      // Approving again finds nothing waiting.
      await owner.api('post', `/users/me/follow-requests/${a.id}/approve`).expect(404);
      const note = await a.api('get', '/notifications').expect(200);
      expect(
        note.body.data.some((x: { title: string }) => x.title === 'Follow request accepted'),
      ).toBe(true);
      expect((await countersAgree(t, owner.id)).ok && (await countersAgree(t, a.id)).ok).toBe(true);
    });

    it('lets the owner decline, and the requester withdraw, without a trace in the counts', async () => {
      const owner = await person(t, { private: true });
      const a = await person(t);
      const b = await person(t);
      await a.api('post', `/users/${owner.id}/follow`).expect(200);
      await b.api('post', `/users/${owner.id}/follow`).expect(200);
      await owner.api('post', `/users/me/follow-requests/${a.id}/decline`).expect(204);
      await owner.api('post', `/users/me/follow-requests/${a.id}/decline`).expect(404);
      await b.api('delete', `/users/${owner.id}/follow`).expect(200);
      const list = await owner.api('get', '/users/me/follow-requests').expect(200);
      expect(list.body.data).toEqual([]);
      expect((await countersAgree(t, owner.id)).ok).toBe(true);
      // A declined person can ask again.
      await a.api('post', `/users/${owner.id}/follow`).expect(200);
    });

    it('cannot be approved by anyone but the person asked', async () => {
      const owner = await person(t, { private: true });
      const other = await person(t, { private: true });
      const a = await person(t);
      await a.api('post', `/users/${owner.id}/follow`).expect(200);
      await other.api('post', `/users/me/follow-requests/${a.id}/approve`).expect(404);
      await a.api('post', `/users/me/follow-requests/${a.id}/approve`).expect(404);
    });

    it('lets in everyone waiting when the account is opened, with the counts right', async () => {
      const owner = await person(t, { private: true });
      const fans = [await person(t), await person(t), await person(t)];
      for (const f of fans) await f.api('post', `/users/${owner.id}/follow`).expect(200);
      await owner.api('patch', '/users/me/profile', { body: { isPrivate: false } }).expect(200);
      expect(await counts(owner, fans[0]!)).toMatchObject({ followers: 3 });
      for (const f of fans) {
        expect(await counts(f, owner)).toMatchObject({ following: 1 });
        expect((await countersAgree(t, f.id)).ok).toBe(true);
      }
      expect((await countersAgree(t, owner.id)).ok).toBe(true);
    });
  });

  describe('lists', () => {
    it('shows followers and following, newest first, with my relation to each', async () => {
      const star = await person(t);
      const viewer = await person(t);
      const fans: Person[] = [];
      for (let i = 0; i < 4; i++) {
        const f = await person(t);
        await f.api('post', `/users/${star.id}/follow`).expect(200);
        fans.push(f);
      }
      await viewer.api('post', `/users/${fans[1]!.id}/follow`).expect(200);

      const res = await viewer.api('get', `/profiles/${star.username}/followers`).expect(200);
      expect(res.body.data.map((u: { id: string }) => u.id)).toEqual(
        fans.map((f) => f.id).reverse(),
      );
      const entry = res.body.data.find((u: { id: string }) => u.id === fans[1]!.id);
      expect(entry.relation.following).toBe(true);
      expect(
        res.body.data.find((u: { id: string }) => u.id === fans[0]!.id).relation.following,
      ).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/email|phone/i);

      const mine = await fans[0]!.api('get', `/profiles/${fans[0]!.id}/following`).expect(200);
      expect(mine.body.data.map((u: { id: string }) => u.id)).toEqual([star.id]);
    });

    it('pages without gaps or repeats', async () => {
      const star = await person(t);
      for (let i = 0; i < 7; i++)
        await (await person(t)).api('post', `/users/${star.id}/follow`).expect(200);
      const viewer = await person(t);
      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const res = await viewer
          .api('get', `/profiles/${star.username}/followers`, {
            query: { limit: 3, ...(cursor ? { cursor } : {}) },
          })
          .expect(200);
        seen.push(...res.body.data.map((u: { id: string }) => u.id));
        cursor = res.body.meta.hasMore ? res.body.meta.nextCursor : undefined;
        pages++;
      } while (cursor && pages < 10);
      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
      expect(pages).toBe(3);
    });

    it('keeps a private account’s lists to its followers', async () => {
      const owner = await person(t, { private: true });
      const follower = await person(t);
      const stranger = await person(t);
      await follower.api('post', `/users/${owner.id}/follow`).expect(200);
      await owner.api('post', `/users/me/follow-requests/${follower.id}/approve`).expect(200);

      const denied = await stranger.api('get', `/profiles/${owner.username}/followers`).expect(403);
      expect(denied.body.error.code).toBe('FORBIDDEN');
      await stranger.api('get', `/profiles/${owner.username}/following`).expect(403);
      const ok = await follower.api('get', `/profiles/${owner.username}/followers`).expect(200);
      expect(ok.body.data.map((u: { id: string }) => u.id)).toEqual([follower.id]);
      await owner.api('get', `/profiles/${owner.username}/followers`).expect(200);
    });

    it('leaves out people who blocked me or whom I blocked', async () => {
      const star = await person(t);
      const viewer = await person(t);
      const normal = await person(t);
      const iBlocked = await person(t);
      const blockedMe = await person(t);
      for (const p of [normal, iBlocked, blockedMe])
        await p.api('post', `/users/${star.id}/follow`).expect(200);
      await viewer.api('post', `/users/${iBlocked.id}/block`).expect(200);
      await blockedMe.api('post', `/users/${viewer.id}/block`).expect(200);

      const res = await viewer.api('get', `/profiles/${star.username}/followers`).expect(200);
      expect(res.body.data.map((u: { id: string }) => u.id)).toEqual([normal.id]);
    });

    it('is not found for someone who blocked me, or who does not exist', async () => {
      const a = await person(t);
      const b = await person(t);
      await b.api('post', `/users/${a.id}/block`).expect(200);
      await a.api('get', `/profiles/${b.username}/followers`).expect(404);
      await a.api('get', `/profiles/${freshName('ghost')}/following`).expect(404);
    });

    it('removes a follower, and marks close friends only among followers', async () => {
      const owner = await person(t);
      const f1 = await person(t);
      const f2 = await person(t);
      const outsider = await person(t);
      await f1.api('post', `/users/${owner.id}/follow`).expect(200);
      await f2.api('post', `/users/${owner.id}/follow`).expect(200);

      await owner.api('put', `/users/me/close-friends/${f1.id}`).expect(200);
      await owner.api('put', `/users/me/close-friends/${outsider.id}`).expect(404);
      const list = await owner.api('get', '/users/me/close-friends').expect(200);
      expect(list.body.data.map((u: { id: string }) => u.id)).toEqual([f1.id]);
      await owner.api('delete', `/users/me/close-friends/${f1.id}`).expect(200);
      expect((await owner.api('get', '/users/me/close-friends').expect(200)).body.data).toEqual([]);

      await owner.api('delete', `/users/me/followers/${f2.id}`).expect(204);
      expect(await counts(owner, owner)).toMatchObject({ followers: 1 });
      expect((await countersAgree(t, owner.id)).ok).toBe(true);
    });
  });

  describe('many at once', () => {
    it('counts a burst of identical requests once', async () => {
      const a = await person(t);
      const b = await person(t);
      const results = await Promise.all(
        Array.from({ length: 10 }, () => a.api('post', `/users/${b.id}/follow`)),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      const rows = await t.db.query<{ n: string }>(
        'SELECT count(*) AS n FROM follows WHERE follower_id = $1',
        [a.id],
      );
      expect(Number(rows.rows[0]?.n)).toBe(1);
      expect((await countersAgree(t, b.id)).ok).toBe(true);
      expect((await countersAgree(t, a.id)).ok).toBe(true);
    });

    it('counts a crowd arriving together exactly', async () => {
      const star = await person(t);
      const crowd = [];
      for (let i = 0; i < 10; i++) crowd.push(await person(t));
      const results = await Promise.all(
        crowd.map((p) => p.api('post', `/users/${star.id}/follow`)),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      const check = await countersAgree(t, star.id);
      expect(check.ok, check.detail).toBe(true);
      expect(await counts(star, crowd[0]!)).toMatchObject({ followers: 10 });
    });

    it('stays consistent when people follow and unfollow in a storm', async () => {
      const star = await person(t);
      const crowd = [];
      for (let i = 0; i < 6; i++) crowd.push(await person(t));
      await Promise.all(
        crowd.flatMap((p) => [
          p.api('post', `/users/${star.id}/follow`),
          p.api('delete', `/users/${star.id}/follow`),
          p.api('post', `/users/${star.id}/follow`),
        ]),
      );
      const check = await countersAgree(t, star.id);
      expect(check.ok, check.detail).toBe(true);
      for (const p of crowd) expect((await countersAgree(t, p.id)).ok).toBe(true);
    });
  });
});
