import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, freshName } from '../support/auth.js';
import { insertMedia, person } from '../support/social.js';

describe('profiles', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  describe('my profile', () => {
    it('starts with what registration gave, and the private fields only I see', async () => {
      const me = await person(t);
      const res = await me.api('get', '/users/me/profile').expect(200);
      expect(res.body.data).toMatchObject({
        id: me.id,
        username: me.username,
        displayName: 'Test Person',
        bio: null,
        isPrivate: false,
        badge: 'NONE',
        accountType: 'PERSONAL',
        counts: { followers: 0, following: 0, posts: 0 },
        gender: null,
        city: null,
      });
      // Never the contact details or the birth date.
      expect(JSON.stringify(res.body)).not.toMatch(
        /dateOfBirth|1998|@blocks|@example|passwordHash|phone/i,
      );
    });

    it('edits only what is sent, and cleans what people type', async () => {
      const me = await person(t);
      const res = await me
        .api('patch', '/users/me/profile', {
          body: {
            displayName: '  Asha\u200B   Rao\u202E  ',
            bio: 'Line one\r\n\r\n\r\n\r\nLine two\u0000   ',
            websiteUrl: 'example.com/about',
            state: 'orissa',
            district: '  Khordha ',
            gender: 'female',
          },
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        displayName: 'Asha Rao',
        bio: 'Line one\n\nLine two',
        websiteUrl: 'https://example.com/about',
        location: { state: 'Odisha', district: 'Khordha' },
        gender: 'female',
      });
      // A later edit of one field leaves the rest.
      const again = await me
        .api('patch', '/users/me/profile', { body: { bio: 'Short bio' } })
        .expect(200);
      expect(again.body.data.displayName).toBe('Asha Rao');
      expect(again.body.data.location.state).toBe('Odisha');
    });

    it('clears optional fields with null, and a state takes its district with it', async () => {
      const me = await person(t, { state: 'Karnataka', district: 'Mysuru' });
      await me.api('patch', '/users/me/profile', { body: { bio: 'Something' } }).expect(200);
      const res = await me
        .api('patch', '/users/me/profile', { body: { bio: null, websiteUrl: null, state: null } })
        .expect(200);
      expect(res.body.data).toMatchObject({
        bio: null,
        websiteUrl: null,
        location: { state: null, district: null },
      });
    });

    it('rejects invalid values, field by field', async () => {
      const me = await person(t);
      const cases: Array<[object, string]> = [
        [{ displayName: '   ' }, 'displayName'],
        [{ displayName: 'x'.repeat(81) }, 'displayName'],
        [{ bio: 'x'.repeat(301) }, 'bio'],
        [{ websiteUrl: 'javascript:alert(1)' }, 'websiteUrl'],
        [{ websiteUrl: 'ftp://files.example.com' }, 'websiteUrl'],
        [{ websiteUrl: 'https://user:pass@example.com' }, 'websiteUrl'],
        [{ websiteUrl: 'localhost' }, 'websiteUrl'],
        [{ state: 'Atlantis' }, 'state'],
        [{ gender: 'robot' }, 'gender'],
        [{ isPrivate: 'yes' }, 'isPrivate'],
        [{ avatarMediaId: 'not-a-uuid' }, 'avatarMediaId'],
      ];
      for (const [body, field] of cases) {
        const res = await me.api('patch', '/users/me/profile', { body });
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(JSON.stringify(res.body.error.details)).toContain(field);
      }
    });

    it('refuses fields that are not the person’s to change', async () => {
      const me = await person(t);
      for (const body of [
        { username: 'someone_else' },
        { badge: 'VERIFIED' },
        { followersCount: 1_000_000 },
        { accountType: 'CREATOR' },
        { status: 'ACTIVE' },
        { email: 'x@y.test' },
        { userId: '01990000-0000-7000-8000-000000000001' },
      ]) {
        await me.api('patch', '/users/me/profile', { body }).expect(400);
      }
      const after = await me.api('get', '/users/me/profile').expect(200);
      expect(after.body.data.badge).toBe('NONE');
      expect(after.body.data.counts.followers).toBe(0);
    });

    describe('the picture', () => {
      it('takes only my own, finished, avatar-purpose image', async () => {
        const me = await person(t);
        const other = await person(t);
        const mine = await insertMedia(t, me.id, { purpose: 'AVATAR' });
        const theirs = await insertMedia(t, other.id, { purpose: 'AVATAR' });
        const processing = await insertMedia(t, me.id, { purpose: 'AVATAR', status: 'PROCESSING' });
        const wrongPurpose = await insertMedia(t, me.id, { purpose: 'POST_IMAGE' });
        const video = await insertMedia(t, me.id, { purpose: 'AVATAR', kind: 'VIDEO' });

        for (const id of [
          theirs,
          processing,
          wrongPurpose,
          video,
          '01990000-0000-7000-8000-000000000001',
        ]) {
          const res = await me.api('patch', '/users/me/profile', { body: { avatarMediaId: id } });
          expect(res.status, id).toBe(400);
          expect(JSON.stringify(res.body.error.details)).toContain('not_available');
        }
        const ok = await me
          .api('patch', '/users/me/profile', { body: { avatarMediaId: mine } })
          .expect(200);
        expect(ok.body.data.avatarUrl).toMatch(/^http.*thumb\.jpg\?e=\d+&s=[\w-]+$/);

        // And it can be removed again.
        const gone = await me
          .api('patch', '/users/me/profile', { body: { avatarMediaId: null } })
          .expect(200);
        expect(gone.body.data.avatarUrl).toBeNull();
      });

      it('cannot be taken from somebody who uses it', async () => {
        const a = await person(t);
        const b = await person(t);
        const shared = await insertMedia(t, a.id, { purpose: 'AVATAR' });
        await a.api('patch', '/users/me/profile', { body: { avatarMediaId: shared } }).expect(200);
        // Not b's asset in the first place, and in use by a.
        await b.api('patch', '/users/me/profile', { body: { avatarMediaId: shared } }).expect(400);
      });
    });
  });

  describe('someone else’s profile', () => {
    it('is found by id, username, @username, and any case', async () => {
      const viewer = await person(t);
      const target = await person(t, { state: 'Kerala', district: 'Thrissur' });
      for (const ref of [
        target.id,
        target.username,
        `@${target.username}`,
        target.username.toUpperCase(),
      ]) {
        const res = await viewer.api('get', `/profiles/${encodeURIComponent(ref)}`).expect(200);
        expect(res.body.data).toMatchObject({
          id: target.id,
          username: target.username,
          isMe: false,
          contentVisible: true,
          restricted: false,
          location: { state: 'Kerala', district: 'Thrissur' },
          relation: {
            following: false,
            requested: false,
            followedBy: false,
            blocked: false,
            blockedBy: false,
            muted: false,
          },
        });
      }
    });

    it('says isMe for my own, with no relation', async () => {
      const me = await person(t);
      const res = await me.api('get', `/profiles/${me.username}`).expect(200);
      expect(res.body.data).toMatchObject({ isMe: true, relation: null, contentVisible: true });
    });

    it('never shows contact details, birth date or private fields', async () => {
      const viewer = await person(t);
      const target = await person(t);
      await target.api('patch', '/users/me/profile', { body: { gender: 'female' } }).expect(200);
      const res = await viewer.api('get', `/profiles/${target.username}`).expect(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/email|phone|dateOfBirth|passwordHash|gender|"city"/i);
      expect(text).not.toContain(target.email);
    });

    it('is not found when it does not exist, is suspended, or is waiting to be erased', async () => {
      const viewer = await person(t);
      await viewer.api('get', `/profiles/${freshName('nobody')}`).expect(404);
      await viewer.api('get', '/profiles/01990000-0000-7000-8000-000000000001').expect(404);
      const suspended = await person(t);
      await t.db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [suspended.id]);
      await viewer.api('get', `/profiles/${suspended.username}`).expect(404);
      const leaving = await person(t);
      await t.db.query("UPDATE users SET status = 'PENDING_DELETION' WHERE id = $1", [leaving.id]);
      await viewer.api('get', `/profiles/${leaving.username}`).expect(404);
    });

    it('needs a signed-in viewer', async () => {
      const target = await person(t);
      await t.http.get(`/api/v1/profiles/${target.username}`).expect(401);
    });

    it('for a private account shows who they are but not their content until accepted', async () => {
      const owner = await person(t, { private: true });
      const stranger = await person(t);
      const follower = await person(t);
      await follower.api('post', `/users/${owner.id}/follow`).expect(200);

      const asStranger = await stranger.api('get', `/profiles/${owner.username}`).expect(200);
      expect(asStranger.body.data).toMatchObject({ isPrivate: true, contentVisible: false });
      const asRequester = await follower.api('get', `/profiles/${owner.username}`).expect(200);
      expect(asRequester.body.data).toMatchObject({
        contentVisible: false,
        relation: { requested: true, following: false },
      });

      await owner.api('post', `/users/me/follow-requests/${follower.id}/approve`).expect(200);
      const asFollower = await follower.api('get', `/profiles/${owner.username}`).expect(200);
      expect(asFollower.body.data).toMatchObject({
        contentVisible: true,
        relation: { following: true },
      });
    });
  });

  describe('search', () => {
    it('finds by part of a username or a name, best match first, never myself', async () => {
      const tag = freshName('zq').slice(-6);
      const me = await person(t);
      const exact = await person(t, { username: `find_${tag}` });
      const prefix = await person(t, { username: `find_${tag}_x` });
      const inner = await person(t, { username: `xx_find_${tag}` });
      await me
        .api('patch', '/users/me/profile', { body: { displayName: `find_${tag} fan` } })
        .expect(200);

      const res = await me
        .api('get', '/search/users', { query: { q: `@find_${tag}` } })
        .expect(200);
      const names = res.body.data.map((u: { username: string }) => u.username);
      expect(names.indexOf(exact.username)).toBeLessThan(names.indexOf(prefix.username));
      expect(names.indexOf(prefix.username)).toBeLessThan(names.indexOf(inner.username));
      expect(names).not.toContain(me.username);
      expect(res.body.data[0]).toHaveProperty('relation');
      expect(JSON.stringify(res.body)).not.toMatch(/email|phone/i);
    });

    it('ignores one-letter queries, caps the results, and is case-insensitive', async () => {
      const me = await person(t);
      expect(
        (await me.api('get', '/search/users', { query: { q: 'a' } }).expect(200)).body.data,
      ).toEqual([]);
      await me.api('get', '/search/users', { query: { q: '' } }).expect(400);
      await me.api('get', '/search/users', { query: { q: 'ab', limit: 99 } }).expect(400);
      const tag = freshName('cs').slice(-6);
      await person(t, { username: `casey_${tag}` });
      const res = await me
        .api('get', '/search/users', { query: { q: `CASEY_${tag.toUpperCase()}` } })
        .expect(200);
      expect(res.body.data.length).toBe(1);
    });

    it('leaves out blocked people, in either direction, and inactive accounts', async () => {
      const tag = freshName('bl').slice(-6);
      const me = await person(t);
      const ok = await person(t, { username: `vis_${tag}` });
      const iBlocked = await person(t, { username: `vis_${tag}_a` });
      const blockedMe = await person(t, { username: `vis_${tag}_b` });
      const suspended = await person(t, { username: `vis_${tag}_c` });
      await me.api('post', `/users/${iBlocked.id}/block`).expect(200);
      await blockedMe.api('post', `/users/${me.id}/block`).expect(200);
      await t.db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [suspended.id]);

      const res = await me.api('get', '/search/users', { query: { q: `vis_${tag}` } }).expect(200);
      expect(res.body.data.map((u: { username: string }) => u.username)).toEqual([ok.username]);
    });
  });
});
