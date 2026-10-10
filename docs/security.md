# BLOCKS security

What is protected, how, which test proves it, and what is **not** yet covered. A control
is listed as present only if code and a passing test exist for it. Items that need a
vendor, a legal opinion or infrastructure that does not exist yet are in section 9.

## 1. Principles

1. **The server decides.** Reach level, counters, verification state, moderation state,
   permissions and location are never accepted from a client. Sending one is a 400, not
   an ignored field (the validation pipe whitelists and forbids unknown properties).
2. **Secure by default.** A route needs a signed-in user unless marked `@Public()`; a
   staff route that declares no permission is refused. Both rules are enforced by a test
   that walks every route (`tests/admin/audit-rbac.int-spec.ts`).
3. **Say nothing that helps an attacker.** Wrong password and unknown account are the
   same answer, with the same attempt count and similar timing; content you may not see
   is "not found", not "forbidden".
4. **Least data.** Sensitive values are masked on output, encrypted at rest, and kept out
   of logs and the audit trail.
5. **Defence in depth.** Application checks give good errors; database constraints and
   triggers hold even if a code path is wrong (`tests/db`).

## 2. Data classification

| Class | Examples | At rest | In responses | In logs |
|---|---|---|---|---|
| Credentials | password hash (argon2id), refresh-token hash, OTP hash, 2FA secret | hashed or AES-256-GCM encrypted | never | never (redacted) |
| Identity / financial | KYC documents, PAN, bank account (Stage 8) | encrypted, field-level, private bucket | masked only | never |
| Contact details | e-mail, phone | plaintext columns, unique-indexed | masked (`a***@x.com`) to the owner; absent for others | masked |
| Profile | name, bio, state/district | plaintext | public per privacy settings | ok |
| Birth date | for the age rule | plaintext on `profiles` | **never returned** | never |
| Content | posts, comments | plaintext | per visibility rules | not logged |

The Aadhaar number is **never** stored or processed by this system (a database CHECK
exists for the KYC table in the schema); see section 9 for the legal position.

## 3. Authentication

| Control | Where | Proven by |
|---|---|---|
| Passwords: argon2id (19 MiB, t=2), policy (10+ chars, mixed classes, common-password and disguised-common check, no username/e-mail inside) | `common/crypto/password.ts` | `crypto.spec.ts`, `registration.int-spec.ts` |
| No account enumeration at register / login / reset / contact change | `auth/*`, `account/*` | `login`, `registration`, `password`, `account` integration specs |
| Sign-in lock-out counted per typed identifier (so real and invented names behave alike); lock survives a cache flush | `auth/login-attempts.ts` | `login.int-spec.ts` |
| One-time codes: CSPRNG, keyed hash bound to challenge, 5 attempts claimed atomically, 10-min life, resend cool-down and caps, decoys for unknown identifiers | `auth/otp.service.ts` | `registration.int-spec.ts` |
| Access token: HS256, 15 min, issuer/audience/algorithm pinned, previous key accepted for verify only (rotation) | `auth/token.service.ts` | `tokens.int-spec.ts` (none-alg, tampering, wrong realm/secret/audience, expiry) |
| Refresh token: opaque, stored hashed, single-use rotation, 10 s grace for lost responses, **reuse beyond grace ends the session and alerts the owner**, 180-day hard limit | `auth/user-session.service.ts` | `tokens.int-spec.ts` |
| Session checked on every request (sign-out is immediate on the instance that handled it) | `auth/guards/user-auth.guard.ts` | `tokens.int-spec.ts`, `login.int-spec.ts` |
| 2FA: TOTP with replay protection (time step stored), single-use hashed backup codes, **password required to start setup** (stops a stolen session enrolling its own authenticator) | `auth/two-factor.service.ts` | `two-factor.int-spec.ts` |
| Password re-check for sensitive actions is rate-limited **per account**, not just per IP | `auth/reauth.service.ts` | `two-factor.int-spec.ts` ("distributed attacker") |
| Risk-based sign-in: new device/network/place scores; high score demands an e-mailed code; owner is told | `auth/login-risk.ts` | `auth-logic.spec.ts`, `login.int-spec.ts` |
| Staff: password + **mandatory** TOTP, forced first-password change, invitation expires, 30-min idle / 8-h hard session limits, no session cache | `admin/auth/*` | `tests/admin/auth.int-spec.ts` (25 tests) |

## 4. Authorisation

* **Staff RBAC.** 11 built-in roles (defined in code, synced to the database on start-up,
  hand edits reverted), custom roles stored in the database. A role change takes effect on
  the person's very next request.
* **No self-escalation.** You can only grant roles/permissions you hold; only a super admin
  can grant or change `super_admin`; nobody changes their own roles, status or 2FA.
* **Separation of duties**, enforced in code and tested: identity review ≠ payout approval,
  bank review ≠ payout approval, balance adjustment ≠ payout approval, Reach configuration
  draft ≠ activate, staff management ≠ sensitive-audit review, licence record ≠ music
  availability. The break-glass `super_admin` is the one exemption.
* **Separation of duties for trust and safety**, enforced in code, and in the database where it can be:
  whoever made a moderation decision cannot take or decide the appeal against it (a trigger on `appeals`
  refuses it even for direct SQL); an escalated report can only be worked by someone holding
  `reports.escalate`; overturning an appeal needs the permission that undoes that kind of decision
  (`content.restore` or `users.restore`) as well as `appeals.decide`; a moderator can hide and remove content
  but only a senior can restrict or suspend an account; changing how reports are handled needs
  `policy.update`, which only a super admin holds; granting an identity badge re-checks on the server that the
  identity is verified at that moment. Verification badges are granted only by staff with `business.verify`
  and are taken back as a separate audited step.
* **Visibility.** One filter (`social/shared/visibility.ts`) for profiles, lists, feeds,
  search, direct lookups and engagement: ownership, approval state, account state, blocks
  in both directions, private accounts, followers-only, close friends, and (for anything posted as a
  business page) whether the page is still published.
* **Every route's protection is listed and tested** (`tests/app/route-protection.int-spec.ts`): the test reads
  the metadata the guards read for every route in the application and fails if a route is public without
  being on a reviewed list, a staff route names no permission, a staff route that changes things is guarded
  only by a read permission, a staff route sits outside `/admin` or an app route inside it, or a
  content-publishing route lacks the restricted-account check.

Proven by `tests/admin/staff.int-spec.ts`, `tests/social/posts.int-spec.ts` (visibility
matrix), `tests/social/blocks.int-spec.ts`, `tests/social/feed-stories.int-spec.ts`.

## 5. Input and output

* **Validation** with class-validator, whitelist + forbid-unknown; limits on every string,
  array and number. Malformed JSON gets the normal error shape.
* **Text cleaning** removes control characters, bidirectional override and zero-width
  characters (spoofing) and normalises to NFC. Output is JSON and clients render text as
  text; the API does not HTML-escape (that would double-escape).
* **SQL.** All queries go through Prisma; the few raw statements are tagged templates
  (parameterised). Dynamic identifiers are not built from input.
* **Mass assignment.** DTOs list what may change; anything else is a 400
  (`profiles`, `posts`, `registration` specs try badge, counts, status, role, reach, ...).
* **Source hygiene.** A unit test fails if invisible bidirectional/zero-width characters
  appear in source ("Trojan Source").
* **Uploads.** Signed direct-to-storage (the API never holds the bytes; the announced size is part
  of the signature), an allow-list of purposes and types, the real type read from the first
  bytes (a declared type is only a claim), limits on size, length and dimensions, and
  **re-encoding with all metadata removed**: only the re-encoded copies are ever served, so
  EXIF/GPS and hidden payloads in an original go no further. Buckets are private; a signed link
  proves only "the API handed this out recently" and the path is checked before the signature
  matters, so originals, a track's full audio, licence documents and KYC files are unreachable
  even with a valid signature. Tests send HTML renamed `.jpg`, truncated and corrupt media,
  decompression-bomb dimensions, and tampered links.
* **ffmpeg** is run with an argument list (no shell), a time limit, an output size ceiling,
  a forced demuxer and `-protocol_whitelist file` (so a crafted file cannot make it fetch a URL
  or follow a playlist). No text a person typed reaches a command line: a reel's edit is
  numbers and ids from fixed ranges and catalogues, and a client can never send a colour
  matrix, a filter definition or a file path.
* **Music rights** are enforced by one function used when listing, when a reel attaches a track
  and again when the reel is rendered; default is *no* (empty country list, missing licence,
  draft status). The licensing and curation duties are held by different people (separation of
  duties in the permission catalogue), licence documents are private and each view is written
  to the sensitive audit trail.

## 5a. The staff console in the browser

* **No token in the page.** Sign-in answers set `HttpOnly` cookies; the JavaScript on the page receives
  only the person's name, roles, permissions and next step. A script injected into the page cannot read a
  token, and the cookies are not sent from another site (`SameSite=Strict`).
* **Cross-site request forgery.** Besides `SameSite`, every state-changing call must come with this app's
  own `Origin`, a custom marker header (browsers do not let another site add one without a CORS
  pre-flight, which this app never allows) and, where the browser says so, `Sec-Fetch-Site: same-origin`.
  Tested in `tests/unit/security-rules.test.ts` and the route tests.
* **Content-security-policy.** Per-request nonce; `script-src 'self' 'nonce-…' 'strict-dynamic'`;
  `style-src` with the nonce only; no `unsafe-eval` in production; `object-src 'none'`,
  `frame-ancestors 'none'`, `form-action 'self'`, `base-uri 'self'`; `connect-src` is this app plus the
  storage address named in `UPLOAD_ORIGINS`; images and media only from this app, the API or the CDN named
  in `MEDIA_ORIGINS`. One deliberate looseness: `style-src-attr 'unsafe-inline'`, because React and the
  charts set `style=""` attributes; it does not allow `<style>` blocks.
* **Other headers.** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  no-referrer`, a restrictive `Permissions-Policy`, `Cache-Control: no-store` on everything, no
  `X-Powered-By`. Files passed through the pipe (identity scans) are served with
  `Content-Security-Policy: default-src 'none'; sandbox`.
* **The pipe cannot be aimed elsewhere.** It forwards only to `/admin/…` below the configured API address;
  path segments are checked (`..`, `.`, encoded dots and slashes, the sign-in prefix are refused) and
  bodies are limited to 1 MB.
* **Real client address.** The API's rate limits and the audit log need the person's address, not this
  server's. `X-Forwarded-For` is believed only to the extent of `TRUSTED_PROXY_HOPS`, counted from the
  right, because anyone can send that header; with 0 it is ignored. The API must be told to trust this app
  as a proxy.
* **Sensitive reading is audited.** Seeing a person's full e-mail or phone (`users.read_contact`) and
  opening an identity scan or a licence document each write a protected-data audit record; the signed links
  last two minutes.
* **Settings and money are guarded twice.** The console validates numbers before sending them, and the API
  validates them again against a closed list; limits that contradict each other are refused. Two people are
  needed to activate Reach settings and to release a closed reward cycle; no one can approve a payout twice.

## 5b. Trust and safety

What the system does about reports, and what it deliberately does not.

* **Reporting.** A person can report only what they could see (so the endpoint cannot be used to find out
  whether something private exists: not found and not yours look the same), not themselves, not more than a
  limit a day (a setting), and the same thing for the same reason once while it is open (a partial unique
  index, so two taps cannot both create one). A short excerpt of what was reported is kept with the report,
  because its author can edit or delete it. **The person reported is never told who reported them**, in a
  notification, an appeal or any other field; the person who reported is told only that it was looked at.
* **Brigading.** Automatic hiding counts *different people*, not reports, and only for categories whose policy
  turns it on (child safety hides at the first report; violence and nudity at three; the rest never). It is
  reversible by one click from a moderator, tells the author, and appears in the history as an automatic
  decision. A mass-reporting campaign can still delay a post for as long as it takes a moderator to look; the
  mitigations are the per-person daily limit, the distinct-reporter count, the "report in bad faith" finding,
  and the audit trail. There is no reporter reputation model.
* **Decisions.** Every decision names a published rule (a closed list, draft wording pending legal review), is
  recorded and audited in the same transaction as the change, and is never edited: a mistake is taken back by a
  new decision that points at the old one, and only the latest decision on an item can be taken back. Private
  staff notes are never shown to the person, the reporter or the appeal.
* **Appeals.** Once per decision, within a window (a setting), reviewed by someone who did not make the decision
  (code and database trigger), with a note written for the person. An appeal against an *automatic* decision
  has no excluded reviewer. A suspended account cannot sign in, so it cannot appeal in the app; that needs a
  route outside it (an e-mail address or web form), which is not built.
* **Safety incidents.** Reports about self-harm and child safety open an incident automatically; staff can open
  others. Each has an owner and an append-only log. "Escalation" **records** that a person told a helpline or an
  authority; BLOCKS does not contact anyone. Who must be told, when, and by whom is a legal and clinical
  decision (below). There is no outreach to a person at risk.
* **Live.** There is no live streaming. What exists is the staff side that must exist first: a list of
  sessions with risk flags, reports and incidents, and an emergency stop (one request, one permission) that marks
  the session terminated in the database before telling the provider, and says honestly whether the provider
  confirmed. The provider interface (`LiveProvider`) has only a null implementation.
* **Messages** are not reportable yet (messaging is not built). When it is, staff must see only the
  messages a person reports, never a whole conversation.

## 5c. Business pages and advertising

* **Pages** are drafts until published; a published page can be suspended by staff, which hides it and
  everything posted as it and pauses its campaigns. A page address is validated and reserved words are refused;
  web addresses must be public https (no credentials, no addresses into private networks).
* **Verification** is a badge a person asks for and staff grant. The conditions are checked by the server when
  asked and again when granted. A GSTIN is checked for form and check character, stored encrypted (bound to the
  page by its context string), shown back as its last four characters, and **never checked against the
  government's register**: the console says so on the review screen.
* **Advertising targeting** is a closed list: a place (country, states, districts) and broad age bands.
  Interests, gender, religion, health, politics and lists of individuals cannot be sent. Advertisers learn an
  audience size rounded down to the hundred, never a list; a campaign aimed at fewer people than a floor (a
  setting) is refused so targeting cannot single anyone out; people under 18 are never counted. **Whether a
  person has agreed to be shown advertising is not recorded**, so everyone counts: consent for advertising is a
  legal question to answer before any campaign is delivered.
* **Money.** Amounts are exact (whole paise, `NUMERIC(18,2)`). A campaign is reviewed by a person before it can
  run, cannot run unpaid (a database CHECK as well as the code), and spend can never exceed the budget or the
  daily limit (a row lock and a conditional write; the delivery recorder has no HTTP route). There is no payment
  provider: funding answers 503, so no campaign has ever run. Refunds on cancellation call the provider after the
  cancellation commits; if that fails the campaign stays marked paid and an audit entry says a person must settle
  it. Ad billing is **not** in the double-entry ledger; its accounting (GST invoices, receivables) needs design
  with finance.

## 6. OWASP Top 10 (2021) mapping

| # | Risk | Status |
|---|---|---|
| A01 | Broken access control | Mitigated and tested: deny-by-default guards, visibility filter, RBAC, ownership in queries |
| A02 | Cryptographic failures | argon2id, AES-256-GCM field encryption with key ids and AAD binding, keyed HMACs, HS256 with per-realm derived keys; TLS is a deployment requirement (`deployment.md`) |
| A03 | Injection | Prisma parameterisation; validation; no shell, no template engine |
| A04 | Insecure design | Threat-driven choices: enumeration resistance, refresh-token theft detection, idempotency, maker/checker |
| A05 | Security misconfiguration | Env validated at start-up, production refuses dev providers/secrets/wildcard CORS, helmet, CSP `default-src 'none'` for the API, Swagger off in production, no framework header |
| A06 | Vulnerable components | `npm audit`: 0 known vulnerabilities (two transitive Prisma-CLI dependencies pinned with `overrides`); install scripts are an explicit allow-list |
| A07 | Identification and authentication failures | Section 3 |
| A08 | Software and data integrity failures | Lockfile committed; append-only audit log and ledger enforced by triggers; no unsigned deserialisation |
| A09 | Logging and monitoring failures | Structured logs with redaction, request ids, immutable audit trail, security events visible to users. **Alerting/monitoring infrastructure is a deployment task** |
| A10 | SSRF | No server-side fetch of user-supplied URLs exists. Must be revisited when link previews or webhooks are added |

## 7. Secrets and cryptography

* All secrets come from the environment; `.env` is git-ignored; `.env.example` has no real
  values. In production, missing or placeholder-looking secrets stop the process.
* `JWT_SECRET` → two derived keys (user, staff). Rotation: set the new value, keep the old
  one in `JWT_SECRET_PREVIOUS` until old tokens expire (15 min).
* Field encryption keys are versioned (`v1.<keyId>.<nonce>.<ct>.<tag>`), each ciphertext is
  bound to its column and row (AAD), and old keys keep decrypting while a new one is active.
* A blind index (HMAC) allows exact-match lookups of encrypted values without storing them
  in the clear.

## 8. Logging, audit, privacy

* Logs redact `authorization`, cookies, passwords, tokens, codes. One-time codes are
  delivered to providers and held only as hashes; the dev outbox (in memory, local network
  only, never registered in production) is the single place a code can be read.
* The **audit log** is append-only (UPDATE/DELETE/TRUNCATE refused by trigger — tested with
  direct SQL), written in the same transaction as the change, redacts secret-looking keys
  as a safety net, and hides entries about protected data from staff who may not see them.
* Users see their own sign-in activity, can acknowledge events, and are told about
  new devices, password changes, 2FA changes, contact changes and account deletion.
* Account deletion has a grace period, then erases personal data but keeps the row that
  money and audit records point to (`tests/auth/account.int-spec.ts`).

## 9. Known limitations and open risks

Stated plainly so nobody assumes more than exists.

**Not built yet**
* **The app is only partly on the real API.** What is connected and what answers "not available" in a live build is
  listed exactly in `IMPLEMENTATION_PLAN.md`, Stage 10.
* **Console limits.** The shared token renewal is per process: behind several instances, route a person to
  one instance (sticky sessions), or a rare simultaneous renewal on a second instance will look like token
  reuse and end the session. There is no automated browser (end-to-end) test of the console; its behaviour is
  covered by unit and component tests, plus manual checks in a real browser. The console has not been
  through an accessibility audit with assistive technology; labels, roles, focus handling and keyboard use
  were built and tested in a simulated browser only, and the manual checks were made in one Chromium-based
  browser.
* Messaging (the tables exist; the service, the reporting of messages and the Flutter screens do not), live
  streaming (only its staff safety side), and the Flutter screens for business pages, verification,
  advertising, appeals and the user side of safety incidents.

**Weaknesses in what exists**
* **Identity, bank and payout providers are mocks.** The workflows, the encryption, the step-up, the
  separation of duties and the ledger are real and tested; whether a PAN exists, an account is real or money
  moved is answered by stand-ins. Production refuses to enable these features until real providers exist, and
  choosing and contracting them is a business and legal task. The callbacks real providers use (webhooks, with
  signature checks) are not built; the worker polls instead.
* **No payout is ever "reversed after completion".** If a bank returns money after reporting success, the
  `REVERSED` state exists but nothing moves a payout into it; today that would be a manual ledger adjustment.
* **PAN-to-name matching is the provider's.** BLOCKS compares the *bank's* account-holder name with the verified
  legal name; it does not verify a PAN itself.
* **Key management.** Field encryption keys come from configuration. In production they should come from a
  secrets manager or KMS; rotation is supported (old values keep decrypting, `needsRotation` reports which to
  re-encrypt) but no re-encryption job exists yet.

* **Fake-engagement detection is a set of heuristics, not a model.** It catches machine-speed
  bursts, many accounts on one device, an author's own device, risky accounts and impossible
  watch times, and it caps what any single signal can add. It cannot catch a well-run farm of
  real devices and verified accounts, and it has not been tuned against real traffic. Detected
  events are excluded from every count, but there is no staff tool yet to review or reverse
  those decisions (the report and appeal queues cover content and accounts, not fraud scores).
* **The reward economics are placeholders.** The default weights, thresholds, multipliers and the
  25% per-creator cap are the brief's illustrative numbers or reasonable guesses. They are meant
  to be tuned by staff with experiments; none has been validated. Funding of the reward pool
  (cash in) is not represented in the ledger.
* **Reach intake counts every report synchronously** (a handful of queries per call) and
  engagement hooks add queries to likes, saves, shares and comments. That is fine for this stage
  and not for launch scale: it should move behind a queue, and scoring should be incremental
  rather than re-aggregating a content's events.
* **Being `ELIGIBLE` is not being payable.** A creator accrues rewards once the record qualifies; a payout
  also needs verified identity, a verified bank account in their own name, no hold and the limits. The
  checklist is computed by the server and shown to the app.
* **No antivirus scanning** of uploads. Files are type-checked and fully re-encoded (nothing
  from the original is served), which removes most of the risk for images and video, but a
  scanning step (for example ClamAV) is not built. Staff-uploaded licence documents (PDF) are
  checked for type and size only and are never served publicly.
* **Automated moderation is a stub.** The provider interface and the "manual" mode (everything goes to a
  person) are built and tested; no automated image/video classifier is connected. The staff side of report
  moderation is built (queue, decisions, appeals, incidents, policy) but has been tested only by automated
  tests and a simulated browser: never used by a real moderation team, and the response-time targets and
  automatic-hold thresholds are placeholders, not tuned or approved by anyone. There is no automatic
  escalation when a report passes its response time (it shows as overdue; nothing moves it).
* **Moderation tooling gaps.** Staff see a report's excerpt and ids, and media through the separate media
  review, but there is no in-queue media viewer; there are no saved responses, bulk actions, moderator
  workload balancing or quality review of decisions; the audit page can show what each moderator decided but
  there is no calibration process.
* **Media has not been tested against a real object-storage bucket**, a CDN, or the host's
  production ffmpeg build (the tests use the local driver, a faked S3 and old dev-only ffmpeg
  binaries). Production must set FFMPEG_PATH / FFPROBE_PATH to supported builds.
* **Location is self-declared.** Reach uses the author's profile location; nothing verifies
  it, so a determined person can claim a district. Mitigation options (limit changes,
  device signals, review) are not implemented.
* **The text screen is a first pass**, not a moderation system: a staff-editable term list,
  link and repetition heuristics. It will miss obfuscation and context.
* **No breached-password check** (haveibeenpwned-style range lookup) and **no CAPTCHA**
  or bot challenge on registration; rate limits and lock-out are the only brakes.
* **Distributed credential stuffing** is limited per account by lock-out, but lock-out can be
  used to annoy a known username (a recognised trade-off; the pause is 15 minutes and a
  password reset clears it).
* **Session cache:** the user guard caches "is this session live" for 5 s per instance, so a
  revocation made on another instance can take up to 5 s to be felt. Staff sessions are not cached.
* **Without Redis** rate-limit and sign-in counters live in each process (the API logs this);
  production start-up requires `REDIS_URL`.
* **Argon2 parameters** follow the OWASP minimum and have **not** been tuned on production
  hardware.
* **No penetration test or external review** has been done. This document is a self-assessment.
* **Dependency risk:** the two overridden Prisma-CLI dependencies are exercised by the test
  suite (migrations and client generation run), but are a deviation from what Prisma ships.

**Needs a legal / policy decision (not an engineering one)**
* The wording of the published moderation rules (all draft), response times, how long reports and decisions
  are kept, and the appeal window.
* **People at risk.** What to say to someone whose content suggests self-harm, which helplines to name, when
  law enforcement or a child-protection body must be told (and the obligations that follow for content
  involving children), and who in the business may make that call. The system records an escalation; it does
  not decide one.
* **Live video.** Whether to offer it at all, the age and eligibility rules, and the duty of care while it is
  live. Do not switch on a live provider before this is answered.
* **Advertising.** Consent to be shown advertising and to age-band targeting under the DPDP Act, ad content
  rules (health, finance, politics, gambling), GST invoicing, and who is liable for an advertisement.
* **Verification.** What proof a business or publisher badge requires, and what BLOCKS promises by granting
  one.
* Minimum age is set to 13 (`MIN_ACCOUNT_AGE_YEARS`); India's DPDP Act treats under-18s as
  children for consent purposes. This needs counsel before launch.
* Aadhaar: this system does not collect, store or authenticate Aadhaar numbers. Any use of
  Aadhaar-based verification must go through a licensed provider under the applicable law.
* Data retention periods, grievance officer process, and content takedown timelines under the
  IT Rules are operational/legal items not encoded here.
* Payments, TDS and GST treatment of creator payouts need professional advice before any
  real money moves.
