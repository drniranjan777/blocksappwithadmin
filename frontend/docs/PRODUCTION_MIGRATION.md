# BLOCKS — Production migration plan, security review, performance review

Scope: this document covers deliverables **G** (mock → production plan), **H** (security review)
and **I** (performance review). It describes the Flutter client only. It was written for the frontend
demo, before any backend existed; **the API integration has since been started** (Stage 10 of
`../../docs/IMPLEMENTATION_PLAN.md`): sections 1.1–1.2 below describe the seam as it was, and what is
now connected, verified and still missing is in that stage's entry. The security and performance
reviews (H, I) were done against the demo and have **not** been repeated against the live build.

## 0. What "30–40 million users" means for a client

A phone app does not "handle" 30–40M users; the **backend, CDN and data layer** do. What the
client must guarantee is that it never becomes the bottleneck or multiplies load:

- fetch only what is on screen (cursor pagination, bounded page size, no full-dataset screens);
- keep memory flat however far the user scrolls (lazy lists, bounded image cache, ≤ 3 video players);
- ask for the right image size (variants), not the original;
- fail softly and retry politely (loading / empty / error+retry on every screen).

Those properties are built in and tested. The capacity itself is a backend design problem (section 1.7).

## 1. G — Migration plan: Mock → API

### 1.1 The seam
`lib/data/providers.dart` is the only file that chooses an implementation. Every repository
provider (the original 14, plus the reel, media, music, creator, KYC, bank, payout, tax and step-up
ones added later; per-interface endpoints are in `CREATOR_REELS_MONEY.md` section 5) goes through
the same `useMockData` switch, and the non-mock branch currently throws
`UnimplementedError('Api<Name> is not implemented yet')`. Migration = implement
`Api*Repository` classes against the existing interfaces in `lib/data/repositories/` and return
them from that branch. **No widget or controller changes are required** because they only see the
interfaces.

### 1.2 Steps, in order

| # | Step | Notes |
|--:|------|-------|
| 1 | Agree the API contract per interface | One OpenAPI spec; opaque `cursor` strings, `limit` ≤ 50 (matches `mock_paging.dart`) |
| 2 | Add an HTTP client (e.g. `dio`) in `lib/data/api/` | Base URL from `AppConfig.apiBaseUrl`; timeouts; retry with exponential backoff + jitter for idempotent GETs |
| 3 | Add DTOs + mappers to the existing immutable models | Keep models unchanged; mapping lives in `data/api` |
| 4 | **Add the `INTERNET` permission to `android/app/src/main/AndroidManifest.xml`** | Today only the debug/profile manifests declare it, so a release build cannot reach the network |
| 5 | Replace `MockAuthRepository` | Real login/OTP/2FA; keep the `AuthRepository` interface |
| 6 | Move tokens to secure storage | `flutter_secure_storage` (Keychain / Keystore). `SharedPreferences` stays for non-sensitive flags only |
| 7 | Implement `ReelPlayback` with a real player | `video_player` or an HLS player; `ReelPlayerPool` (≤ 3) and the UI stay as they are |
| 8 | Image CDN | Implement `ImageUrlResolver` to emit size variants (thumb / feed / full); `BlocksImage` already decodes at display size |
| 9 | Realtime | Messages and notifications over WebSocket / FCM, exposed through the existing repositories |
| 10 | Server-authoritative money and reach | See 1.3 |
| 11 | Remote config | Load `ReachConfig` and `LiveEligibilityConfig` from the server instead of `ReachConfig.demo()` |
| 12 | Observability | Crash reporting + privacy-reviewed analytics; wire `AppConfig.enableLogging` (currently unused) |
| 13 | Release hardening | Flavors, `--obfuscate --split-debug-info`, CI running `analyze` + `test` |
| 14 | Media permissions | Photos/videos (Android 13+ granular media permissions), camera and microphone, with usage strings; replace the generated media library and the simulated "record" |
| 15 | Real media pipeline | On-device compression behind `MediaProcessingRepository`, signed chunked upload behind `MediaUploadRepository`, server transcoding + moderation behind `ReelPublishRepository` |
| 16 | Identity, bank and payout | Vendor-backed KYC and bank verification, payout rails, step-up auth; documents go to private storage by signed upload and never through the app's storage |

### 1.3 Things the client must stop being the source of truth for
These pure-Dart calculators are correct and tested, but in production they are **display and
preview only**; the server must compute and enforce the same rules:
`ReachCalculator` (level unlocks), `CreatorEarningsCalculator`, `CampaignRules` (budget / reach
estimates), `LiveEligibilityEvaluator`, `PostDraftValidator`, `ReelValidator`, `MediaOptimizer`,
`PayoutRules` (eligibility, minimum, step-up threshold), `KycFormValidator`, `BankAccountValidator`
and `NameMatcher`. Clients can be modified; never pay,
promote or unlock anything based on a client-side result.

### 1.4 Contract tests
`test/data/mock_repositories_test.dart` and the feature tests exercise behaviour through providers.
Reuse the same scenarios against `Api*Repository` (pointed at a staging server) so the mock and the
real implementation are held to one contract.

### 1.5 Rollout order that limits risk
Auth → User/Profile → Feed/Post (read) → Interactions (like/follow/comment) → Create (media upload)
→ Reels (real playback) → Notifications/Messages (realtime) → Business/Promote/Creator (money,
needs payment compliance) → Verification/Safety (needs KYC and moderation vendors).

### 1.6 Known placeholders to replace
- `https://blocks.example/...` share links in `share_sheet.dart` and `profile_screen.dart`:
  read the deep-link base from configuration and register real app links.
- Hindi / Telugu strings are first-pass; get a native-speaker review.
- Demo copy in the info pages (guidelines, terms, privacy) is placeholder text, not legal text.

### 1.7 Backend capabilities the client assumes (out of scope here)
Keyset-paginated feeds with precomputed or hybrid fan-out, CDN-fronted media with transcoding,
rate limiting and abuse controls, idempotency keys on writes (likes, follows, payments), cache
tiers for hot content, and sharding by user / district. These decide whether 30–40M users is
achievable; the client only avoids making it harder.

## 2. H — Security review

Method: source search of `lib/` for keys, tokens, passwords, URLs, `print`/`debugPrint`, `dart:io`,
webviews and URL launchers; review of storage keys, Android manifests and configuration.

| Area | Finding | Status |
|------|---------|--------|
| Secrets | No API keys, tokens, passwords or credentials in source. `.env.example` documents non-secret `--dart-define` names only; `.gitignore` excludes `.env` and `env/*.json` | OK |
| Local storage | `SharedPreferences` holds only: onboarding done, demo-session flag, theme, language, sensitive-content / comment / message preferences and boolean toggles (`StorageKeys`) | OK for the demo |
| Authentication | The "demo session" is a local flag, **not authentication**. Router redirects are UX; they protect nothing | Replace before launch (1.2 #5–6) |
| Network | No network code exists. Release Android manifest has no `INTERNET` permission | Add deliberately; HTTPS only, no cleartext; consider pinning for auth endpoints |
| Input validation | `PostDraftValidator`, report and campaign forms validate client-side for UX only | Server must re-validate everything |
| Money | No payment code. Promote flow creates a demo campaign and moves no money. Identity, bank account and payout are mock repositories with step-up confirmation; review in `CREATOR_REELS_MONEY.md` section 6 | Needs a PCI-scoped provider, KYC / bank vendors and server-side authority |
| Moderation | Report / block / mute are connected to the real API in a live build (`ApiModerationRepository`; the demo keeps its mock). The review side is the staff console's: queue, decisions under published rules, appeals, live incidents. Reel moderation is still a mock server stage in the demo. No automated classifier, no real KYC | Server side built; a classifier and KYC vendor are vendor work. Appeals from the app are not built |
| Third-party code | 9 runtime packages (adds `audioplayers`, `image_picker`), no analytics / ads / payment SDKs, no webview, no URL launcher | Low surface; add dependency auditing to CI |
| Logging / PII | Nothing is logged; no PII beyond mock data | Keep PII out of logs when `enableLogging` is wired |
| Deep links | Routes take opaque ids; unknown settings sub-routes redirect | Validate ownership / access server-side for every id |
| Privacy law | Not assessed. India's DPDP Act 2023 (consent, children's data, erasure) will apply to real users | Needs legal review; not legal advice |

**Fix before launch:** `INTERNET` permission, secure token storage, configurable share base URL,
real auth, server-side enforcement of every rule listed in 1.3.

## 3. I — Performance review

### 3.1 In place, and how it is checked

| Concern | Mechanism | Evidence |
|---------|-----------|----------|
| Long lists | `ListView.builder` / slivers; items keyed; `LoadMoreFooter` triggers the next page when built | Widget tests scroll feeds and grids |
| Paging | `PagedNotifier<T>`: de-duplicated load-more, refresh, prepend; mock page size capped at 50 | `paged_notifier_test.dart` |
| Memory per screen | Data is generated per page from ids (`MockFactory`); nothing large is held | Design; mock repo tests |
| Images | Only via `BlocksImage` (decode width = display size × DPR, `memCacheWidth`); global `ImageCache` bounded to 150 items / 80 MB in `main.dart` | Code review |
| Video | `ReelPlayerPool`: current + previous + next, `assert(activeCount <= maxActive)`, players disposed on scroll-away; playback pauses when the Reels tab is not visible | `reels_test.dart` |
| Rebuilds | Riverpod `.select`, immutable `Equatable` models, `const` widgets, per-id interaction overlay instead of rebuilding lists | Code review |
| Tab state | `StatefulShellRoute.indexedStack` keeps each tab's scroll position | Flow tests |
| Search | Debounced input | `utils_test.dart` |
| Accessibility / motion | Reduce-motion respected (splash, ladder, celebration); layouts survive 1.6× text on 360 px | a11y + locale smoke tests |

### 3.2 Not measured (be explicit)
No profile-mode run on a real device was done. These are **unverified**: frame times on a low-end
phone, cold-start time, peak memory after scrolling hundreds of posts, APK size, battery. The
checks above prove bounded *structure*, not measured *speed*.

How to measure:

```bash
flutter run --profile                      # then DevTools: Performance, Memory
flutter build apk --analyze-size           # download size
```
Add an `integration_test` that scrolls 500 mock posts and reads memory / timeline summaries.

### 3.3 Risks to watch when real data arrives
- **Indexed tabs stay alive.** Four tab trees remain in memory; fine today, but profile it once
  feeds contain real media.
- **Global refresh epoch.** `contentEpochProvider` makes feeds reload together after a new post;
  against a real API, scope it so one action does not trigger several simultaneous refreshes.
- **Retry storms.** Add backoff + jitter and a per-session retry budget before launch.
- **Procedural art is CPU painting.** `DemoArt` is demo-only; real images use the cached path.
- **Prefetching.** Keep it bounded (next page and neighbouring reels only).
