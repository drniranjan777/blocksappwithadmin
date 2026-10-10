# BLOCKS deployment

How to run BLOCKS outside a developer's machine: what it needs, how to configure it, how to build
and release it, how to watch it, and how to get back from a bad day.

> **Read this first.** Nothing here has been run in a real environment. The API, the staff console and
> the database migrations have run only on a developer's Windows machine, against an npm-provided
> PostgreSQL and the local file-storage driver. There is no Dockerfile, no Kubernetes manifest and no
> infrastructure-as-code in the repository, and none of this document's production steps has been
> rehearsed. Treat it as a checklist to be turned into a tested pipeline, not as a record of one.
> What cannot work until the business supplies it is listed in section 12.

## 1. What runs

| Part | What it is | State | Needs |
|---|---|---|---|
| **API** (`backend/`) | NestJS 12, Node 22.12 or newer (developed on 24). One process serves HTTP and also runs the housekeeping timers (retry deliveries, purge expired codes, erase accounts, run campaigns, pay out, ...). | Stateless apart from the database, Redis and object storage; any number of instances. | PostgreSQL, Redis, object storage, ffmpeg/ffprobe, e-mail/SMS/push providers |
| **Staff console** (`admin-frontend/`) | Next.js 16 server (sign-in cookies and a forwarding route live in the server, not the browser). | Stateless. Several instances need sticky routing (section 8). | The API's address |
| **Mobile app** (`frontend/`) | Flutter, Android and iOS. | Built and released through the app stores, not through this document. | The API's address |
| **PostgreSQL** | 16 or newer. Extensions `pg_trgm` and `pgcrypto` (both "trusted", so the database owner can create them). | | UTC time zone (section 4) |
| **Redis** | 7. Shared rate-limit and sign-in counters. **Required in production**: the API refuses to start without `REDIS_URL`. | | |
| **Object storage** | Any S3-compatible service. Two private buckets: one for uploads and processed media, one for identity documents. | | |

There is no message queue: background work is database rows claimed with `FOR UPDATE SKIP LOCKED`, so
every API instance can do it and none is special.

## 2. Environments

Keep at least three: **development** (a laptop), **staging** (production's shape, fake money and test
accounts, real e-mail and storage so the paths are exercised) and **production**. The API behaves
differently by `NODE_ENV`:

* `development`/`test`: missing secrets fall back to clearly-labelled development values (a warning
  is printed), the in-memory outbox can show "sent" codes, Swagger is on.
* `production`: the process **refuses to start** if a secret is missing or weak, if a wildcard CORS
  origin is set, if a development provider is selected, if the developer outbox is on, if Redis is
  missing, or if identity/bank/payout features are on while only mock providers exist. This is
  deliberate: a misconfigured production must fail loudly at start-up, not run weakly.

## 3. Configuration

All configuration is environment variables, validated once at start-up (`backend/src/config/env.ts`).
`backend/.env.example` is the complete annotated list; this is what production must set.

**Always**

| Variable | Notes |
|---|---|
| `NODE_ENV=production` | |
| `DATABASE_URL` | A role that owns the database (migrations need it). The application can run as a second, less-privileged role (section 4). |
| `DATABASE_POOL_MAX` | Per instance. Budget as database connection limit divided by instances, or put PgBouncer in front. |
| `REDIS_URL` | Required. |
| `JWT_SECRET`, `OTP_HMAC_SECRET`, `BLIND_INDEX_KEY` | 32+ random characters each (`openssl rand -base64 48`), all different. |
| `FIELD_ENCRYPTION_KEYS`, `FIELD_ENCRYPTION_ACTIVE_KEY` | JSON of key id to base64 of 32 random bytes, and the id of the one to encrypt with. From a secrets manager or KMS. |
| `CORS_ORIGINS` | The staff console's origin (browser clients only; the mobile app sends no `Origin`). No wildcard. |
| `TRUST_PROXY_HOPS` | How many reverse proxies sit in front. Wrong values make every client look like the proxy (rate limits and the audit log then see one address) or let a client forge its address. |
| `PUBLIC_API_URL`, `PUBLIC_WEB_URL`, `ADMIN_CONSOLE_URL` | Used to build signed media links and the links in e-mail. |
| `EMAIL_PROVIDER`, `SMTP_URL`, `EMAIL_FROM`, `SMS_PROVIDER`, `PUSH_PROVIDER` | Sign-in codes and security alerts. `dev` is refused in production. **No real adapter for e-mail, SMS or push is written yet:** only the development ones exist, and a setting that names any other provider stops the process at start-up (it never falls back to the development outbox). Until the adapters are added, production cannot start. See section 12. |
| `STORAGE_DRIVER=s3`, `S3_REGION`, `S3_ENDPOINT`, `S3_BUCKET_PRIVATE`, `S3_BUCKET_KYC`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Buckets private, no public ACLs, server-side encryption on. `CDN_BASE_URL` if a CDN serves processed media. |
| `FFMPEG_PATH`, `FFPROBE_PATH` | The host's own supported builds. The npm ffmpeg packages are old, development-only, and must never be shipped. |
| `MODERATION_PROVIDER=manual` | Every upload waits for a person. `dev` approves everything and is refused in production. |
| `ADMIN_CONSOLE_URL` | Where staff sign in (put in invitation e-mails). |

**Features that stay off until a provider exists**

| Variable | Production value today |
|---|---|
| `MONEY_FEATURES_ENABLED` | unset/`false`. Identity checks, bank accounts and payouts only have mock providers; production refuses to enable them. |
| `ADS_BILLING_PROVIDER` | `none`. Campaigns can be approved but cannot be paid for, so none ever runs. `dev` pays for them without moving money and is refused in production. |

**Staff console** (`admin-frontend/.env.example`): `BLOCKS_API_URL` (server-side only), `ALLOWED_ORIGINS`,
`UPLOAD_ORIGINS` (where the browser may send files: the object storage origin), `MEDIA_ORIGINS` (the CDN),
`COOKIE_SECURE`, `TRUSTED_PROXY_HOPS`.

**Secrets** never go in the repository or in an image. Use the platform's secret store; the
repository only ever contains `*.example` files. The first staff account is created with
`npm run admin:create` (it prints a one-time password); there is no seeded production admin.

### Rotating secrets

* **`JWT_SECRET`**: put the new value in `JWT_SECRET` and the old one in `JWT_SECRET_PREVIOUS`. The old one
  only verifies; it never signs. Remove it after the longest token lifetime (refresh tokens: 60 days by
  default, or revoke all sessions to shorten that).
* **Field-encryption keys**: add `k2`, make it active; old values keep decrypting with `k1`. A job that
  re-encrypts old rows does not exist yet (`needsRotation` reports which rows), so do not delete `k1`.
* **`OTP_HMAC_SECRET`**: changing it invalidates codes in flight (users ask for another); harmless.
* **`BLIND_INDEX_KEY`**: changing it breaks every duplicate check that uses a blind index (for example
  "this PAN is already registered"). Do not rotate it without a re-indexing job, which does not exist.

## 4. Database

```bash
# once per environment: create the database and a role that owns it
createdb blocks
psql blocks -c "ALTER DATABASE blocks SET timezone TO 'UTC'"   # the first migration also tries this
```

* **UTC.** Every time is stored with its time zone and the first migration sets the database to UTC; if
  the migration role does not own the database that step is skipped with a notice, so set it yourself.
* **Migrations** are SQL files in `backend/prisma/migrations`, applied in order with
  `npm run db:migrate` (`prisma migrate deploy`). They are forward-only. Run them **before** starting
  the new version, from one place (a release job), never from every instance at start-up. Review the
  hand-written ones (`*_integrity`, `*_trust_integrity`, `*_business_integrity`): they hold the rules
  Prisma cannot express (triggers, partial unique indexes, CHECK constraints). `npm run db:verify`
  applies every migration to an empty database and prints what it created; `npm run db:drift` shows
  whether the schema files and the migrations agree.
* **Compatibility.** Make each release work with the schema before and after its own migration
  (expand, deploy, contract), so a rollback of the code does not need a rollback of the schema.
  Enum values added by a migration (`ALTER TYPE ... ADD VALUE`) cannot be removed.
* **Privileges.** Run migrations as the owner. The application role needs `SELECT/INSERT/UPDATE/DELETE`
  on tables and `USAGE` on sequences. The audit trail also refuses `UPDATE`, `DELETE` and `TRUNCATE` by
  trigger, even for the owner; keep it that way.
* **Sizing.** Start with the managed-database size you would pick for a social app of your launch
  traffic and measure; this repository makes no claim about how many users one instance serves. The
  indexes in `database-schema.md` were designed for keyset pagination; no load test has been run.

## 5. Build and release

```bash
# API
cd backend
npm ci                      # install scripts are blocked unless listed in package.json (reviewed one by one)
npm run db:generate
npm run build               # nest build -> dist/
npm run db:migrate          # as the release job, once
node dist/main.js           # npm start

# Console
cd admin-frontend
npm ci
npm run build
npm start                   # next start (Node server; not a static export)
```

Before releasing: `npm run typecheck && npm run lint && npm run test:all` in `backend/`, and `npm run typecheck
&& npm run lint && npm test && npm run build` in `admin-frontend/` (and `flutter analyze && flutter test` for the
app). The backend suite takes about 15 minutes and wants a quiet machine; run nothing else heavy beside it.

A reasonable pipeline: build once, produce an immutable image per service, run the migration job,
deploy to staging, run the live smoke checks (section 9), promote the same image to production, roll
instances one at a time behind the load balancer, watch the health endpoints and error rates, and keep
the previous image to roll back to. Rolling back the code is safe if you followed the compatibility
rule above; rolling back the schema is not routine (section 10).

### Process shape

* The API listens on `PORT`, behind a TLS-terminating proxy or load balancer. It sets security headers
  itself (CSP `default-src 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, frame denial) but does not
  terminate TLS and does not set HSTS: the proxy does.
* The console sets a per-request CSP nonce in `src/proxy.ts`, so every page is rendered per request. Put
  it behind TLS and set `COOKIE_SECURE`.
* **Background timers** run inside every API process unless `WORKERS_ENABLED=false`. They are safe to run
  on every instance. If you would rather have a small number of worker instances, run the same image
  with `WORKERS_ENABLED=false` on the web tier.
* Give media processing its own sizing: `MEDIA_WORKER_CONCURRENCY` files at a time, each using CPU for
  ffmpeg and scratch space in `MEDIA_TEMP_DIR`. Plan for it to starve the web tier if they share a
  small machine.
* Console: several instances share nothing, but the one-time-use refresh token is renewed in the
  instance that sees the request. Route a given person to one instance (sticky sessions), or a rare
  simultaneous renewal on a second instance looks like token reuse and ends their session.

## 6. Object storage

* Two buckets, both private. Uploads go **directly** from the app to the bucket with a short-lived signed
  address (`UPLOAD_URL_TTL_SECONDS`, 15 minutes by default); the API never receives the bytes. Originals
  are deleted after processing (a worker, `purge-originals`); only re-encoded renditions are served.
* Identity documents live in the second bucket, are encrypted, are never served publicly, and are deleted
  by a worker after the retention period (`kyc.document_retention_days`, a setting; the business and its
  counsel set the number).
* Turn on bucket versioning or object lock where the platform allows, lifecycle rules for
  abandoned multipart uploads, and access logging. Grant the API's credentials only the two buckets.
* **Not exercised.** Nothing has run against a real bucket, a CDN or the host's production ffmpeg; the
  tests use a local driver, a faked S3 and development ffmpeg binaries. Do this in staging first.

## 7. Providers

| Provider | Today | To go live |
|---|---|---|
| E-mail | Development adapter only (`smtp` is accepted by the settings but has no adapter, so it stops start-up). | Write the SMTP or API adapter (one class and one line in `providers.module.ts`); check SPF/DKIM/DMARC for the sending domain. |
| SMS | Development adapter only. | Write the adapter for the chosen gateway (a DLT-registered sender and templates are required for India). |
| Push | Development adapter only. | Write the FCM/APNs adapter; upload credentials to the secret store. |
| Moderation (media) | `manual` (a person approves everything) or `dev`. | Connect an automated service by adding a provider; nothing else changes. |
| Identity (KYC), bank verification, payouts | Mock only. | Choose, contract and integrate real providers (webhooks with signature checks are not built; a worker polls). Needs legal review first. |
| Ad billing | None; a development stand-in. | A payment gateway integration, GST invoicing and the accounting for it. |
| Live video | None. | A live service, built against `LiveProvider` (section 12). |

## 8. Network, TLS and proxies

* TLS everywhere; the proxy terminates it and sets `X-Forwarded-For`. Set `TRUST_PROXY_HOPS` to the exact
  number of proxies (for the API and for the console).
* The console and the API are different origins; the console's server calls the API server-side, so the
  browser never needs the API's address and the API's CORS list only needs the console's origin for the
  one browser flow that goes directly to it. Keep the API's admin routes (`/api/v1/admin/...`) reachable
  from the console's servers only if your network lets you (a private path or an allow-list): the
  routes are authenticated, but there is no reason for the internet to reach them.
* Put a WAF or rate limiter in front for volumetric abuse. The application's own limits are per account and
  per address and are a second line, not the first.

## 9. Monitoring

What the code gives you:

* `GET /api/v1/health/live` (the process is up, never touches a dependency) and `/health/ready` (database
  reachable, Redis reachable). Wire liveness to restarts and readiness to the load balancer. They reveal no
  versions, hosts or errors.
* **Structured JSON logs** with a request id on every line, an `X-Request-Id` header on every response, and
  that id in every error body, so one report from a person finds one log line. Secrets, tokens, codes and
  bodies are redacted. Ship them to a log store; set `LOG_LEVEL=info`.
* A **503 with `Retry-After`** (not a 500) when the database pool is exhausted: alert on a rising rate of
  these, it means pool size, a slow query or a connection leak.
* The **audit log** (`audit_logs`, append-only) is a security signal as well as a record: alert on bursts of
  `admin.login` failures, `user.contact_viewed`, role changes, payouts approved, and
  `live.terminate_provider` with `providerConfirmed: false` or `ads.refund_failed` (a person must settle
  those by hand).
* Queue-like tables to graph: `media_jobs` by status (failed and retrying), `notification_deliveries`
  (failed and queued past their time), `payout_requests` by status, `reports` and `appeals` past their
  due time, `safety_incidents` open, `ad_campaigns` in review. The staff console's dashboard shows the
  counts.

What it does not give you: **no metrics endpoint** (Prometheus or otherwise), no tracing, no dashboards, no
alert rules, no uptime probe from outside. Add them. Useful first alerts: readiness failing, error-rate
and p95 latency per route group, database connections near the limit, disk on the media scratch
directory, Redis unreachable (the API then falls back to per-process limits and logs it), worker tasks
failing repeatedly (each task's name is in the log line `Maintenance ... failed`).

### Smoke checks after a release

1. `/health/ready` is 200 on every instance.
2. Sign in as a staff member in the console; the dashboard loads.
3. Register a test account, receive the code, post, see it in the feed.
4. Upload a small image and see it processed and approved or queued, depending on `MODERATION_PROVIDER`.
5. Report that post from a second account; see it in the moderation queue.

## 10. Backup and recovery

**What must be backed up:** PostgreSQL (everything that matters), the two object-storage buckets
(processed media and identity documents), and the secrets (field-encryption keys most of all: without
them the encrypted columns are unreadable, and a backup of the database alone is not a backup of the
data). Redis holds only counters; losing it loses nothing durable.

**PostgreSQL**

* Use continuous archiving (point-in-time recovery) plus periodic base backups; a managed service does this.
  Daily logical dumps (`pg_dump`) are a supplement, not the plan.
* Retention: decide with counsel; keep backups for no longer than the retention you promise users for
  deleted accounts, or erased data comes back with a restore (see "erasure and restores").
* **Test restores.** A backup nobody has restored is a hope. Restore into a scratch environment on a
  schedule, start the API against it, and run the smoke checks.
* Targets: agree a recovery point objective (how much data you can lose) and a recovery time objective
  with the business. This repository does not set them.

**Object storage:** versioning, cross-region replication for the processed-media bucket, and a separate,
more restricted copy policy for identity documents. Processed media can in principle be regenerated only
from originals, which are deleted after processing, so treat the bucket as the source of truth.

**Erasure and restores.** Deleting an account erases personal data and keeps the rows money and the audit
log refer to. After restoring from a backup, **replay erasures that happened after the backup** (the
`users` rows with `status = 'DELETED'` in the live database before the restore, or a log of them), or
people who were erased reappear.

### Runbooks (starting points)

| Event | First steps |
|---|---|
| **A signing secret leaked** | Rotate `JWT_SECRET` (old value into `JWT_SECRET_PREVIOUS` only if you can accept the exposure window; otherwise rotate without it and accept that everyone signs in again). Revoke all sessions with a SQL update on `user_sessions`/`admin_sessions` (set `revoked_at`) for the affected realm. |
| **An encryption key leaked** | Add a new key, make it active, plan a re-encryption of every encrypted column, and tell counsel: identity and bank data may be exposed. |
| **A staff account is compromised** | Disable it (`admin.users.manage`) which revokes its sessions at once; read its audit trail; revert what it changed; rotate anything it could read. |
| **A bad migration** | Stop the rollout. If it has not completed, fix forward. If it did, restore the database to the point before it (PITR) into a new instance and cut over, accepting the data lost since. Migrations are not routinely reversible. |
| **A live session must end now** | Staff with `live.terminate` use the console. If the console is down, the API call is `POST /api/v1/admin/live/sessions/:id/terminate`. The session is marked terminated in the database first, which a live provider must treat as authoritative. |
| **Database full / pool exhausted** | Expect `503 Retry-After`. Find the slow query or leak; scale connections only after you know why. |
| **Redis down** | The API keeps serving with per-process limits and says so in the log. Restore it; do not leave production without it. |

## 11. Release checklist

* [ ] All three test suites green on a quiet machine; the live Flutter tests against staging.
* [ ] Migration reviewed, applied to staging, and verified there (`db:verify`, smoke checks).
* [ ] New settings and their defaults noted (they appear in the console's Settings page).
* [ ] New environment variables added to every environment's secret store.
* [ ] `docs/api-documentation.md` regenerated (`npm run docs:api`) if routes changed.
* [ ] Rollback plan stated: which image, and whether the schema change is compatible with it.

## 12. What this deployment cannot do until someone supplies it

* **Credentials and contracts:** SMS and push gateways, a real KYC provider, a bank-verification service, a
  payout rail, an ad payment gateway, an object-storage account and CDN, a secrets manager/KMS.
* **Infrastructure:** managed PostgreSQL and Redis, container images and an orchestrator, TLS and DNS, a
  WAF, a log store, metrics, alerting and an on-call rota, backup storage in a second region.
* **Code not written:** the e-mail, SMS and push adapters (so production cannot start today); webhook receivers for providers; a metrics endpoint; a
  re-encryption job for rotated keys; a live-video service; any ad-serving service (so campaigns record no
  delivery); the Flutter screens for business pages, verification, advertising, appeals and messaging.
* **Legal and policy decisions** (see `security.md`, last section): minimum age and parental consent,
  retention periods, takedown timelines under the IT Rules, GST and TDS on creator payouts, consent for
  advertising, the wording of the published moderation rules, and what happens when a person may be in
  danger (who is contacted, when, and who may do it).
