import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV } from '../support/auth.js';
import { countersAgree, person } from '../support/social.js';

describe('blocking and muting', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  describe('blocking', () => {
    it('hides each person from the other, silently', async () => {
      const a = await person(t);
      const b = await person(t);
      await a.api('post', `/users/${b.id}/block`).expect(200);

      // The blocker still sees a bare card (so there is an "unblock" button)…
      const mine = await a.api('get', `/profiles/${b.username}`).expect(200);
      expect(mine.body.data).toMatchObject({
        restricted: true,
        contentVisible: false,
        relation: { blocked: true },
      });
      expect(mine.body.data).not.toHaveProperty('counts');
      expect(mine.body.data).not.toHaveProperty('bio');
      // …the blocked person finds nothing at all, and is told nothing.
      const theirs = await b.api('get', `/profiles/${a.username}`).expect(404);
      expect(theirs.body.error.code).toBe('NOT_FOUND');
      const notes = await b.api('get', '/notifications').expect(200);
      expect(notes.body.data).toEqual([]);
    });

    it('removes any follow in either direction, and the counts with it', async () => {
      const a = await person(t);
      const b = await person(t);
      await a.api('post', `/users/${b.id}/follow`).expect(200);
      await b.api('post', `/users/${a.id}/follow`).expect(200);
      await a.api('post', `/users/${b.id}/block`).expect(200);

      const rows = await t.db.query<{ n: string }>(
        'SELECT count(*) AS n FROM follows WHERE (follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1)',
        [a.id, b.id],
      );
      expect(Number(rows.rows[0]?.n)).toBe(0);
      expect((await countersAgree(t, a.id)).ok).toBe(true);
      expect((await countersAgree(t, b.id)).ok).toBe(true);
      const me = await a.api('get', '/users/me/profile').expect(200);
      expect(me.body.data.counts).toMatchObject({ followers: 0, following: 0 });
    });

    it('also removes a pending request', async () => {
      const owner = await person(t, { private: true });
      const a = await person(t);
      await a.api('post', `/users/${owner.id}/follow`).expect(200);
      await owner.api('post', `/users/${a.id}/block`).expect(200);
      const waiting = await owner.api('get', '/users/me/follow-requests').expect(200);
      expect(waiting.body.data).toEqual([]);
      expect((await countersAgree(t, owner.id)).ok).toBe(true);
    });

    it('is safe to repeat, and unblocking does not bring the follows back', async () => {
      const a = await person(t);
      const b = await person(t);
      await a.api('post', `/users/${b.id}/follow`).expect(200);
      await a.api('post', `/users/${b.id}/block`).expect(200);
      await a.api('post', `/users/${b.id}/block`).expect(200);
      await a.api('delete', `/users/${b.id}/block`).expect(204);
      await a.api('delete', `/users/${b.id}/block`).expect(204);

      const profile = await a.api('get', `/profiles/${b.username}`).expect(200);
      expect(profile.body.data.relation).toMatchObject({ blocked: false, following: false });
      await a.api('post', `/users/${b.id}/follow`).expect(200);
      expect((await countersAgree(t, b.id)).ok).toBe(true);
    });

    it('can be done to someone who has already blocked me', async () => {
      const a = await person(t);
      const b = await person(t);
      await b.api('post', `/users/${a.id}/block`).expect(200);
      await a.api('post', `/users/${b.id}/block`).expect(200);
      await a.api('delete', `/users/${b.id}/block`).expect(204);
      // b still blocks a.
      await a.api('get', `/profiles/${b.username}`).expect(404);
    });

    it('rejects blocking yourself or someone who does not exist', async () => {
      const a = await person(t);
      const self = await a.api('post', `/users/${a.id}/block`).expect(400);
      expect(JSON.stringify(self.body.error.details)).toContain('cannot_block_yourself');
      await a.api('post', '/users/01990000-0000-7000-8000-000000000001/block').expect(404);
      await a.api('post', '/users/nope/block').expect(400);
    });

    it('is listed, newest first, with paging', async () => {
      const a = await person(t);
      const others = [];
      for (let i = 0; i < 5; i++) {
        const o = await person(t);
        others.push(o);
        await a.api('post', `/users/${o.id}/block`).expect(200);
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const res = await a
          .api('get', '/users/me/blocks', { query: { limit: 2, ...(cursor ? { cursor } : {}) } })
          .expect(200);
        seen.push(...res.body.data.map((u: { id: string }) => u.id));
        cursor = res.body.meta.hasMore ? res.body.meta.nextCursor : undefined;
        pages++;
      } while (cursor && pages < 10);
      expect(seen).toEqual(others.map((o) => o.id).reverse());
    });

    it('does not let the blocked person see who the blocker follows or is followed by', async () => {
      const a = await person(t);
      const b = await person(t);
      const c = await person(t);
      await a.api('post', `/users/${c.id}/follow`).expect(200);
      await a.api('post', `/users/${b.id}/block`).expect(200);
      await b.api('get', `/profiles/${a.username}/following`).expect(404);
      await b
        .api('get', `/profiles/${c.username}/followers`)
        .expect(200)
        .then((res) => {
          expect(res.body.data.map((u: { id: string }) => u.id)).not.toContain(a.id);
        });
    });
  });

  describe('muting', () => {
    it('changes nothing visible: the profile, the follow and the counts stay', async () => {
      const a = await person(t);
      const b = await person(t);
      await a.api('post', `/users/${b.id}/follow`).expect(200);
      await a.api('post', `/users/${b.id}/mute`).expect(200);
      const profile = await a.api('get', `/profiles/${b.username}`).expect(200);
      expect(profile.body.data.relation).toMatchObject({
        following: true,
        muted: true,
        blocked: false,
      });
      expect(profile.body.data.restricted).toBe(false);
      // And the muted person sees nothing different.
      const theirs = await b.api('get', `/profiles/${a.username}`).expect(200);
      expect(theirs.body.data.relation).toMatchObject({ blockedBy: false, muted: false });
      expect((await countersAgree(t, b.id)).ok).toBe(true);
    });

    it('is listed separately from blocks, and undone with unmute', async () => {
      const a = await person(t);
      const b = await person(t);
      const c = await person(t);
      await a.api('post', `/users/${b.id}/mute`).expect(200);
      await a.api('post', `/users/${b.id}/mute`).expect(200);
      await a.api('post', `/users/${c.id}/block`).expect(200);

      const muted = await a.api('get', '/users/me/blocks', { query: { kind: 'MUTE' } }).expect(200);
      expect(muted.body.data.map((u: { id: string }) => u.id)).toEqual([b.id]);
      const blocked = await a.api('get', '/users/me/blocks').expect(200);
      expect(blocked.body.data.map((u: { id: string }) => u.id)).toEqual([c.id]);

      await a.api('delete', `/users/${b.id}/mute`).expect(204);
      expect(
        (await a.api('get', '/users/me/blocks', { query: { kind: 'MUTE' } }).expect(200)).body.data,
      ).toEqual([]);
      await a.api('get', '/users/me/blocks', { query: { kind: 'EVERYTHING' } }).expect(400);
    });

    it('cannot be aimed at yourself', async () => {
      const a = await person(t);
      await a.api('post', `/users/${a.id}/mute`).expect(400);
    });
  });
});
