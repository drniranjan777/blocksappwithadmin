# BLOCKS architecture

This document describes the system **as it is built today**. Where something is planned
but not built, it says so; the live status of every stage is in
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md). The database is described in
[`database-schema.md`](database-schema.md), the security model in
[`security.md`](security.md), and operations in [`deployment.md`](deployment.md).

## 1. The pieces

```
  Flutter app ──────────┐                         ┌── Object storage (S3-compatible)
  (frontend/)           │      HTTPS / JSON       │   private buckets, signed URLs
                        ├──────────────────────►  │
  Admin console ────────┘    /api/v1/...          │   originals, processed copies, music
  (admin-frontend/)         NestJS API (backend/)  │
                              │        │           └── Redis: rate limits, sign-in counters,
                              │        │               job queues (queues: later stage)
                              ▼        ▼
                         PostgreSQL   Providers (interfaces; dev implementations today)
                         (Prisma)     e-mail · SMS · push · KYC · bank · payout
```

| Piece | Technology | State |
|---|---|---|
| Mobile app | Flutter | Finished demo on mock repositories; API integration is Stage 10 |
| API | NestJS 12, TypeScript, Prisma 7, PostgreSQL | Foundation, auth, staff realm, social APIs built and tested |
| Admin console | Next.js 16, React 19, Tailwind 4 | Built and tested (Stage 9): see section 6b |
| Cache / counters | Redis | Used when `REDIS_URL` is set; falls back to per-process memory, and says so |
| Queues / workers | PostgreSQL job table (BullMQ on Redis installed, not used) | Media work is queued in `media_jobs` and claimed with row locks; housekeeping runs on in-process timers |
| Object storage | S3-compatible (local disk in development) | Signed direct uploads, private buckets, signed or CDN delivery; tested against a fake S3 and the local driver, **not yet against a real bucket** |
| Media tools | ffmpeg / ffprobe | Checking, re-encoding and assembling uploads; the host's own build in production |

## 2. Two realms, kept apart

The API serves two kinds of caller that never share credentials, tables, sessions or
signing keys:

| | App users | Staff |
|---|---|---|
| Tables | `users`, `user_sessions` | `admin_users`, `admin_sessions` |
| Token | JWT, audience `blocks-app`, key derived for `user` | JWT, audience `blocks-admin`, key derived for `admin` |
| Sign-in | password, optional 2FA, risk-based extra step | password **and** mandatory 2FA, forced first-password change |
| Session life | refresh token rotated on use, up to 180 days | 30 min idle, 8 h hard limit, no caching |
| Authorisation | the signed-in user, plus content visibility rules | role permissions checked on every request |
| Routes | everything under `/api/v1` except `/admin/*` | `/api/v1/admin/*`, marked `@AdminRoute()` |

A token from one realm is meaningless in the other: different key, different audience,
and each guard looks the session up in its own table. This is tested in both directions.

## 3. Request lifecycle

```
request ─► request-id ─► helmet ─► CORS allow-list ─► body limit (256 kB)
        ─► rate limiter (per IP; tighter on sensitive routes)
        ─► auth guard (user realm, or staff realm for @AdminRoute)
        ─► validation pipe (whitelist; unknown fields are an error)
        ─► controller ─► service ─► Prisma / providers
        ─► envelope interceptor  { data, meta? }   or   exception filter  { error }
```

* Every response carries `X-Request-Id`; every error body repeats it.
* Success: `{ "data": ..., "meta": { "nextCursor", "hasMore" } }`. Failure:
  `{ "error": { "code", "message", "details?", "requestId" } }`. `code` is stable and
  meant for programs; messages never reveal whether an account exists.
* Lists are **cursor-paginated** (keyset on `(time, id)`), maximum 50 per page. A cursor
  is opaque and validated; a tampered one is a 400.
* Secure by default: a route needs a signed-in user unless it says `@Public()`. A staff
  route that declares no permission is refused, not allowed. A test walks every route
  and fails if either rule is broken.

## 4. Modules (what lives where)

```
backend/src/
  config/        validated environment (fails fast in production)
  common/        errors, pagination, logging redaction, crypto helpers, throttling,
                 idempotency, system settings
  database/      Prisma client (UTC sessions), standalone client for scripts
  auth/          registration, sign-in, OTP, sessions, 2FA, password reset, risk scoring
  security/      login activity, alerts, "secure my account", 2FA management
  account/       contact changes, account deletion workflow
  notifications/ in-app notices, push-device registration, delivery log and retries
  providers/     e-mail / SMS / push interfaces and their development implementations
  admin/         staff sign-in, roles and permissions, separation of duties, audit log,
                 staff management
  social/        profiles, follows, blocks, posts, comments, likes/saves/shares,
                 feeds, hashtags, trending, stories, reading reels
  media/         signed uploads, the work queue, validation, transcoding, moderation,
                 delivery of processed files, rendering reels
  music/         the licensed music library, rights checks, staff tools, licences
  reels/         making, editing and removing reels (the edit; rendering is in media/)
  trust/         reports, the moderation queue and decisions, appeals, safety incidents, the live
                 session safety tools, and the policy that sets severity and response times
  business/      business pages (drafts, publishing, followers, offers, posting as a page,
                 analytics) and verification badges
  ads/           advertising campaigns: drafting, review, payment seam, lifecycle, delivery limits
  workers/       housekeeping timers (retry deliveries, purge codes, erase accounts, run campaigns, ...)
  dev/           development-only outbox (never registered in production)
```

## 5. Decisions worth knowing

**The database enforces what matters most.** Ledger entries are append-only and must
balance; balances are updated by a trigger under a row lock; a story must expire after
it was created; erased accounts are the only ones allowed to lose their contact details.
Application code gives friendly errors; the database is the last line of defence and is
tested directly (`tests/db`).

**Counters are never trusted from a client, and never drift.** Follower, like, comment,
save and post counters change in the same transaction as the row that causes them, and
only when a row really was created or removed. Tests compare every stored counter with
a count of the rows it summarises, including under parallel and racing requests.

**One visibility rule, written once.** `social/shared/visibility.ts` expresses "who may
see this" as a database filter used by profiles, lists, feeds, search, single lookups and
engagement. A page cannot leak a row a later check would have hidden. Content a viewer
may not see is "not found", never "forbidden", so existence is not revealed.

**Retries are safe.** Creating a post or comment accepts an `Idempotency-Key`; a retry
after a lost response returns the first answer instead of doing the work twice.

**Time is UTC everywhere.** Every connection sets `timezone=UTC` (found and fixed
during testing: Prisma sends timestamps without an offset, so a non-UTC server would
silently shift every time it stored).

**Providers sit behind interfaces.** E-mail, SMS, push (and later KYC, bank
verification, payouts, storage, transcoding, moderation) are abstract classes. Only
development implementations exist; a production start-up with a provider configured but
no adapter **refuses to start** rather than silently dropping messages.

## 5a. Media, music and reels

**Uploads.** The app announces a file (`POST /media/uploads`: purpose, kind, type, size), gets
a signed address, sends the bytes **straight to storage** (the API never holds a video), then
says it is done. A purpose not on the allow-list (`REEL_VIDEO`, `MUSIC_*`, `KYC_DOCUMENT`) cannot
be uploaded through the app at all. The announced size is part of the signature.

**The queue.** Work is rows in `media_jobs`, claimed with `FOR UPDATE SKIP LOCKED`, so any
number of API processes share it and nothing is taken twice or lost if Redis is down.
`VALIDATE` reads the real type from the bytes and probes the file (limits on size, length,
dimensions); `TRANSCODE` re-encodes into a ladder of qualities with a poster and a thumbnail,
**removing all metadata**; `MODERATE` asks a provider about a still. Only the re-encoded copies
are ever served. A file that is the problem is refused for good; anything else retries with
growing delays. ffmpeg runs with an argument list (never a shell string), a time limit, a
size ceiling and **local files only** (`-protocol_whitelist file`).

**Moderation** sits behind an interface: `dev` approves everything (refused in production),
`manual` sends everything to a person. A decision, from a machine or a person, goes through one
place (`MediaModerationService`), so both lead to the same outcome.

**Delivery.** `/media/f/...` serves processed files for a signed, expiring link (stable for
hours so image caches work). Only `pub/<asset>/...` and a music track's `preview.m4a` and
`cover.jpg` can be reached; originals, a track's full audio, licence documents and KYC files
cannot, whatever the signature.

**Music.** Staff upload audio to a signed address; the server checks it, makes a cleaned
**full** copy (kept server-side, used only to mix into reels), a 30-second **preview** and a
cover. What a person may use is decided by one function (`checkAvailability`: status, country,
use, licence) both when listing and when a reel attaches a track, and again when the reel is
rendered. Two permissions, held by different people, split the work: `music.manage` decides what
is *offered*; `music.licences.manage` records what is *permitted* (licences and the rights type).
A live track whose last licence is revoked or ends is taken down at once.

**Reels.** A reel is *described*, not uploaded. The creator uploads clips and photos as
`REEL_CLIP` (each is checked, re-encoded and looked at on its own), then sends the edit.
The server validates every part, saves it, and queues a `COMPOSE` job. That job waits until
the clips are ready, cuts and joins their processed copies at 1080x1920 and 30 fps (crop to fill,
or the whole picture over a blurred copy), applies the colour looks, mixes in the music, and
stores the result as **a new video the server made**, which then goes through the ordinary
transcode and moderation steps. The reel is published when that video **and every clip in it**
are cleared and the caption is clean; if any one is refused the reel comes down. See the
completion notes in the implementation plan for what is and is not rendered exactly.

## 6. The Reach Ladder, creator earnings and the ledger

**The ladder.** Posts and reels carry `reach_level` (District, State, National, Global) and
`qualified_reach`. Only the Reach Engine writes them; no client field can, and the intake
endpoint rejects any field it does not know. Where a viewer is comes from their own profile, never
from the phone.

**Counting.** The app reports only what it observed ("on screen for 4.2 s", `POST /reach/events`).
The server decides whether that was a *qualified view* (enough time, from an account old and
verified enough), keeps one per viewer per content, and scores how fake it looks (velocity,
many accounts on one device, the author's own device, risky accounts, implausible watch time).
Events at or over a threshold are kept as evidence but excluded from every count. Likes, saves,
shares and meaningful comments are noticed by the server's own handlers, once per person.

**Scoring.** A background job computes a 0-100 Qualified Reach Score for content with new events:
a weighted sum of seven signals (qualified viewers, watch quality, shares, saves, meaningful
comments, geographic spread, trust), each capped at its target so no single number can be bought.
A rung needs its reach threshold **and** a minimum score **and** audience spread (State: several
districts; National: several states; Global: several countries and an international audience). A rung,
once earned, is kept, except that when fake engagement is newly found the level is recomputed
from what is left. Every score is stored with the counts it came from and the configuration
version, so it can be reproduced exactly (a test does).

**Configuration.** Weights, targets, thresholds, fraud limits, reward multipliers and eligibility
live in versioned documents (`reach_config_versions`). Only a draft can be edited (the database
refuses otherwise); a draft is validated on every save; going live takes a different person
from the one who drafted it, and a reason; every step is audited with the settings that changed.
The shipped default uses the brief's illustrative weights and the demo ladder as *placeholders*.

**Money.** A reward cycle shares a fixed pool among eligible creators by claim (qualified views x
rung multiplier x quality), never a rate per view. Closing a finished cycle fixes each share and
moves no money. A second person then releases it: each creator is credited in one ledger journal
under a unique key, so a repeated, concurrent or half-finished release cannot pay anyone twice.
**Estimated** (a projection for the cycle in progress), **pending** (fixed, awaiting release),
**finalized** (released) and **available** (the ledger balance) are different numbers and are never
mixed. All money is whole paise in `bigint` inside the server. The database enforces that journals
balance, entries are append-only, balances change only through entries, and a creator's balance
cannot go negative. The funding of the pool itself (cash in) is not modelled in the ledger yet.

## 6a. Identity, bank accounts and payouts

**Switch.** `MONEY_FEATURES_ENABLED` is on in development and **off by default in production**, and
production refuses to start with it on while only the mock providers exist. When off, anything that
would take an identity document, bank details or a payout request answers 503; reading still works.

**Providers.** Identity (KYC), bank verification and the payout rail are interfaces
(`payments/providers`). Only labelled mock implementations exist (their behaviour is driven by simple
patterns so tests can exercise every outcome). A real provider is a new class and a configuration
value; nothing else changes. Nothing in BLOCKS decides who someone is, whether an account exists, or
whether money arrived: it records the provider's answer and acts on it.

**Step-up.** Adding, changing or removing a bank account, a payout above a threshold, and changing
tax details each need a fresh step-up: the account password (counted by the account's own limiter) plus a
code sent to the account's own verified contact. The result is a token that works once, for one named
purpose, for five minutes, stored only as a hash.

**Identity.** The person submits legal name, PAN (and date of birth, or business details with an
optional GSTIN checked by its checksum) plus scans of accepted documents. Not every document is
accepted for every purpose, and **Aadhaar is accepted nowhere**: a number shaped like one is refused in
any field. Identifiers are AES-256-GCM encrypted (bound to their row), masked everywhere they are shown
and found by a keyed hash. Scans live in a separate private bucket, are checked by real file type, and
can be seen only through a two-minute signed link given to a named staff member, audited as a sensitive
access. The provider decides: a clear match is verified, a doubtful case goes to a person, a failure is
rejected. A person can approve only a case the provider sent for review, and every decision is a review
row plus an audit record in the same transaction as the change. Documents and stored numbers are deleted
when their retention ends.

**Bank accounts.** Added only by someone verified. The bank is asked whether the account exists and whose it
is, and the name it returns is compared **on the server** with the verified legal name: a clear match is
verified, a partial one waits for a person (who cannot approve a mismatch), a mismatch is refused. The
number is encrypted, one account cannot sit on two profiles, and any change pauses payouts for a while and
alerts the owner.

**Payouts.** A request is re-checked on the server (identity, a verified account in the person's own name,
monetisation in good standing, no hold, balance, limits), needs a step-up above a threshold, and in the same
transaction **moves the amount out of the creator's balance into a clearing account**. Large payouts and any
from a recently added account wait for a person; very large ones for two *different* people. A worker sends
approved payouts (the payout id is the provider's reference, so a retry cannot pay twice) and records the
outcome: paid, or the hold reversed. A creator can cancel before it is sent. Money in flight is always
exactly what the clearing account holds (a test checks it).

## 6b. The staff console (`admin-frontend/`)

**Shape.** A Next.js app whose browser code never talks to the API and never holds a token. The browser
calls this app's own routes; this app's server calls the API.

```
  browser ──► /api/auth/*   sign-in steps: tokens go into HttpOnly cookies, the page gets only
     │                      "where you stand" (next step, who you are, what you may do)
     └──────► /api/bff/*    a pipe to /api/v1/admin/*: adds the person's token, renews it when it
                            expires, passes the answer back untouched
```

* **Cookies.** An access token and a refresh token, both `HttpOnly`, `SameSite=Strict`, `Path=/`,
  session cookies; in production `Secure` and the `__Host-` prefix. Closing the browser signs the person
  out (the API also ends sessions after 30 idle minutes and 8 hours).
* **Renewal.** A refresh token works once; the API treats a second use as theft. The pipe therefore shares
  one refresh between requests that notice the expiry together, and keeps its answer for 20 seconds for
  requests already on their way. This is per process (see `security.md`).
* **Cross-site requests.** Every change must carry an `Origin` that is this app's own address, a marker
  header only this app's scripts can add, and must not be labelled cross-site by the browser.
* **Page policy.** `src/proxy.ts` sets a content-security-policy with a fresh nonce for every request, so
  only scripts this server produced can run. For that reason **every page is rendered per request**
  (Cache Components and partial prerendering are off); there is no static content to cache, and nothing
  about a staff session is ever stored by a shared cache (`Cache-Control: no-store`).
* **What the menu shows** comes from the permissions the API reports for the signed-in person
  (`/admin/auth/me`). Hiding an item is a courtesy: the API re-checks every call, and the console
  shows the API's own words when it refuses.
* **Modules built:** sign-in (forced password change, authenticator set-up with backup codes, code entry),
  dashboard (live counts and charts, each section only if the person's roles may read it), users (search,
  masked contact details, suspend / restrict / restore / sign-out-everywhere with a reason, internal notes),
  media review (approve or refuse with a note, failed-job retry), music library (tracks, rights, audio and
  cover upload straight to storage, licences and signed documents), Reach engine (versions, a validated
  draft editor, four-eyes activation, score history), earnings (cycles: open, change, close, release by a
  different person; creator lookup, ledger, adjustments, monetisation), identity checks, bank accounts,
  payouts, staff, roles and permissions, audit log, settings.
* **Added with trust and safety, business and advertising:** the moderation queue (a view per state, filters
  by kind, reason and severity, a decision log with "take back"), the report drawer (what was reported, the
  standing of the account, other reports, the history) with take, release, escalate and decide, appeals (with
  the reason a button is missing when you made the decision), safety incidents (an append-only log),
  live monitoring (empty until a live service exists, and says so), policy configuration, business pages,
  business verification, advertisers and campaigns (review, flag, pause, resume). The menu groups are Trust &
  safety and Business.
* **Not built, so not in the menu:** messaging moderation (there is no messaging) and anything about
  live video beyond the safety tools.

**Staff API added for the console** (all under `/api/v1/admin`, all permission-checked and audited):
`users` (list, one account, suspend, restrict, restore, revoke sessions, notes), `dashboard`,
`settings` (a closed list; each value validated; money limits kept consistent with each other),
`media/jobs`, `media/jobs/:id/retry`, `media/review`, `media/review/:id/decision`.

**Restricted accounts.** `RESTRICTED` is a real state: the person stays signed in and can read, but routes
marked `@Publishes()` (posts, reels, stories, comments) answer `403 ACCOUNT_RESTRICTED`. A suspension also
signs the person out of every device.

## 6c. Trust and safety, business pages and advertising

Three modules that sit beside the social core and reuse its visibility rules, its audit log and its
notification service.

**Reports to decisions.** A person reports something they can see (`POST /reports`). The report gets a severity
and a response time from the policy for its category, a priority that rises with the number of *different*
people reporting the same thing, and, where the policy says so, the content is hidden pending review.
Moderators work a queue: take a report (atomic), look at the item, the account's standing and the history,
and decide it under a published rule. A decision, its audit entry and the change to the item happen in one
transaction; the people involved are told afterwards (the author with the rule and how to appeal, the
reporter only that it was looked at). A mistake is taken back by a new decision pointing at the old one.
Reports about self-harm and child safety also open a safety incident with its own owner and log.

**Appeals.** A person appeals a decision once, in a window; someone who did not make the decision reviews it
(also enforced by a database trigger); overturning performs the same reversal a direct take-back does.

**Live.** There is no live video. The staff tools that must exist before it does are built against a
`LiveProvider` interface whose only implementation is a null one: list sessions, see their reports and incidents,
end one in a single request (the database first, then the provider).

**Business pages and badges.** A page is a draft until published; posting as a page sets `business_page_id` on
the post, and the visibility filter hides those posts if the page is suspended. A badge is requested by the
person and granted by staff after the server re-checks its condition (identity verified, page published).

**Advertising.** Targeting is a closed schema (place and broad age bands). A campaign is drafted, sent for
review, approved by a person, paid for through a `BillingProvider` (none exists, so it stops there), and
only then started by the scheduler. Delivery is written by a service method with every limit enforced
(`AdsDeliveryService.record`), which has no HTTP route because the ad server that would call it does not
exist. Database CHECKs back the rules that matter most: no active campaign unpaid, none live without a
reviewer, spend within budget, a daily limit within the total.

See `security.md` sections 5b and 5c for the protections and the open risks, and `api-documentation.md`
for every route.

## 7. What scale this design supports (and what is not claimed)

Nothing here has been load-tested, and no capacity figure is claimed. What the design
does to make scale *possible*:

* stateless API processes behind a load balancer; sessions and counters in PostgreSQL and
  Redis, not process memory (except a 5-second session cache, noted in `security.md`);
* keyset pagination everywhere, so page 10,000 costs what page 1 does;
* batch lookups (one query for a whole page of people), never one per row;
* indexes shaped to the queries (see `database-schema.md`);
* work that is not on the request path (delivery retries, housekeeping) runs on timers
  today and moves to queues without changing the tasks.

Known limits to address before real scale, in order: the feed is computed at read time
(fan-out-on-read) which will need a precomputed home feed per user; the visibility
filter uses relational sub-queries which should be measured and likely denormalised at
high follower counts; counters on hot rows (a viral post's `likes_count`) need sharded or
batched increments. These are engineering work items, not claims.
