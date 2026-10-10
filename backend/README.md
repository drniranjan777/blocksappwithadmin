# BLOCKS API

NestJS 12 · TypeScript · Prisma 7 · PostgreSQL · Redis (optional in development).
The system design is in [`../docs/architecture.md`](../docs/architecture.md), the database in
[`../docs/database-schema.md`](../docs/database-schema.md), the security model in
[`../docs/security.md`](../docs/security.md), and what is built versus mocked in
[`../docs/IMPLEMENTATION_PLAN.md`](../docs/IMPLEMENTATION_PLAN.md).

## Run it

```bash
npm install                 # install scripts are blocked unless listed in package.json (reviewed one by one)
cp .env.example .env        # development values only; read the comments
npm run db:up               # starts a local PostgreSQL (npm-provided, no install needed)
npm run db:migrate          # applies every migration
npm run db:seed             # creates a super admin; the password is printed once
npm run start:dev           # http://localhost:4000, API under /api/v1
```

Swagger is at `http://localhost:4000/api/docs` (development only; it is off in production).
Codes "sent" by e-mail or SMS in development can be read at `GET /api/v1/dev/outbox` (local only;
refused in production).

Media work needs `ffmpeg` and `ffprobe`. Development can use the host's (`FFMPEG_PATH`,
`FFPROBE_PATH` in `.env`). Production must too: the npm packages used by the tests are old
builds and are **dev-only**.

## Check it

```bash
npm run typecheck && npm run lint
npm test                    # unit tests: pure logic, and ffmpeg against real files
npm run test:int            # integration tests: a real PostgreSQL, every module, real HTTP
npm run db:drift            # the Prisma schema and the migrations agree
```

Integration tests start one PostgreSQL, migrate a template database, and give every test file
its own clone. They use real ffmpeg and the local storage driver; provider adapters (e-mail, SMS,
push, moderation) are the development implementations. They do **not** talk to a real S3 bucket,
a CDN or a real KYC/bank/payout provider.

The whole suite takes about 15 minutes, mostly `tests/reels` (real video rendering). Those tests have a
5-minute limit each, and on the development machine a single ffmpeg step has occasionally stalled for the
whole limit; the same test then passes on a re-run. Set `MEDIA_TRACE=1` to print every media job and
every ffmpeg/ffprobe start and end to stderr, which shows which step stalled. Do not run other heavy work
(builds, other test suites) while it runs: the database pool is small in tests and starved runs fail
with "Unable to start a transaction in the given time" (the API answers that as `503`, not `500`).

## Layout

```
src/
  config/ common/ database/   environment, errors, pagination, crypto, idempotency, Prisma
  auth/ security/ account/    users: sign-up, sign-in, OTP, sessions, 2FA, deletion
  admin/                      the staff realm: sign-in, roles, audit, staff management, and the console's
                              app-user tools (admin/users), dashboard and settings; the media review
                              queue sits with the media code (media/admin)
  reach/ earnings/ ledger/    the Reach engine, creator rewards and the double-entry ledger
  payments/                   identity (KYC), bank accounts, payouts, step-up, with mock providers
  social/                     profiles, follows, posts, comments, engagement, feeds, stories
  media/                      uploads, job queue, processing, moderation, delivery, reel rendering
  music/                      the licensed library, rights, staff tools, licences
  reels/                      making, editing and removing reels
  notifications/ providers/   in-app notices and the e-mail / SMS / push interfaces
  workers/                    housekeeping timers
prisma/schema/                the data model, one file per domain
prisma/migrations/            SQL history (hand-written rules live beside generated ones)
tests/                        integration and ffmpeg tests (unit tests sit beside the code)
scripts/                      migrations, drift check, first admin
```

## Conventions

* `/api/v1`. Success is `{ data, meta? }`; lists are cursor-paginated (`meta.nextCursor`,
  `meta.hasMore`, `limit` up to 50). Errors are `{ error: { code, message, details?, requestId } }`.
* Creating things is safe to retry: send an `Idempotency-Key` header.
* A route needs a signed-in user unless it says `@Public()`; a staff route that declares no
  permission is refused. A test walks every route and fails if either rule is broken.
* A new database change is a new migration (`npm run db:migrate:create -- <name>`); applied
  migrations are never edited.
* No secret is committed. `npm run admin:create` makes the first staff account in production.
