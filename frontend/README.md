# BLOCKS — Flutter frontend demo

India-first social platform with the **Reach Ladder** (District → State → National → Global).
This is a **frontend-only demo**: no backend, API, real auth, payments, ads, live streaming,
push or AI moderation. Every screen runs on deterministic mock data behind repository
interfaces, so a real API can replace the mocks without touching UI code. That includes the
creator side: the reel editor, media optimisation and upload, music library, identity (KYC),
bank account and payout flows all work end to end, but over mock repositories. No real media
is decoded, no real document is read, and no money moves.

- Flutter 3.47 / Dart 3.13 · Riverpod 3 · go_router · ARB localisation (`en`, `hi`, `te`)
- 261 source files · 46 test files · **899 tests** · `flutter analyze` clean
- Demo user: **Aarav Kumar** (`@aarav.blocks`, State level)

Read next: [`docs/DELIVERY_PROTOCOL.md`](docs/DELIVERY_PROTOCOL.md) (architecture, phases, demo
navigation flow), [`docs/SECURITY_PROFILE_REELS.md`](docs/SECURITY_PROFILE_REELS.md) (account
security, profile, Reels-first launch), [`docs/CREATOR_REELS_MONEY.md`](docs/CREATOR_REELS_MONEY.md)
(reel editor, media pipeline, music, Creator Studio, KYC, bank, payout; per-interface migration
points) and [`docs/PRODUCTION_MIGRATION.md`](docs/PRODUCTION_MIGRATION.md) (mock → API plan, security
review, performance review).

## Run

```bash
flutter pub get
flutter analyze
flutter test
flutter run                              # demo mode is the default
flutter run --dart-define=APP_ENV=demo   # same, explicit
flutter run -d chrome                    # quickest way to look around
```

After editing any `lib/l10n/*.arb` file run `flutter gen-l10n` (it also runs on `flutter pub get`
/ `flutter run` because `generate: true` is set).

Build-time configuration is non-secret and passed with `--dart-define`; see `.env.example`.
No keys, tokens or credentials exist anywhere in the repository.

## A. Project structure

```
lib/
  main.dart                 bounds the image cache, injects LocalStore
  app/
    app.dart                MaterialApp.router; theme/locale applied live
    config/                 AppConfig (--dart-define: APP_ENV, DEMO_MODE, API_BASE_URL)
    router/                 Routes (single source of truth), go_router + auth redirects, MainShell
    theme/                  tokens (spacing/radius), palette + ThemeExtension, typography, light/dark
  core/                     feature-agnostic building blocks
    constants/ errors/ extensions/ pagination/ services/ utils/
    widgets/                design-system widgets (see section C)
  data/
    models/                 immutable, Equatable models + PagedResult<T>
    repositories/           repository INTERFACES (what the UI depends on)
    services/               demo-only services (security and creator demo labs)
    mock/                   MockWorld (in-memory "server"), MockFactory, Mock*Repository
    providers.dart          the ONLY place that picks Mock vs Api implementations
  features/<feature>/       domain/ (pure rules)  application/ (Riverpod)  presentation/ (UI)
    auth onboarding splash home post stories reels explore create profile creator
    business notifications messages verification safety settings engagement reach
    security reel_studio kyc payout
  l10n/                     app_en.arb, app_hi.arb, app_te.arb  (+ generated gen/)
test/                       mirrors lib/; helpers/ has pumpBlocksApp, app driver, fake playback
docs/                       DELIVERY_PROTOCOL.md, SECURITY_PROFILE_REELS.md,
                            CREATOR_REELS_MONEY.md, PRODUCTION_MIGRATION.md
```

Dependency rule: **UI → controller/provider → repository interface → Mock (today) / Api (later)**.
Widgets never import `data/mock`.

## B. Screens implemented

| Area | Screen / flow | Route |
|---|---|---|
| Entry | Splash ("BLOCKS" · "Made in India ♥", ~2.6 s, static when reduce-motion) | `/` |
| | Onboarding (5 pages: welcome, District→World, create/share/grow, earn, business) | `/onboarding` |
| | Demo sign-in ("Continue as Demo User") | `/auth` |
| Tabs | **Home**: Following · For You · Rising · Near You · India feeds, story tray | `/home` |
| | **Explore**: search, trending, district→state→India→global discovery, categories | `/explore` |
| | **Reels**: vertical full-screen player, ≤3 players alive | `/reels` |
| | **Profile**: stats, Reach card + ladder, Posts / Reels / Tagged grids | `/profile` |
| Create | Hub, Post (photo or text, caption + hashtag validation, posts into your district), Story, Go Live (eligibility gate) | `/create`, `/create/post`, `/create/story`, `/create/live` |
| Reel studio | Multi-clip editor (video + photo, reorder, trim, split, duplicate, replace, filters, adjustments, transitions, text, stickers, music, cover), music library, details, optimise → upload → moderation → published | `/create/reel`, `/create/reel/music`, `/create/reel/details`, `/create/reel/publishing` |
| Content | Post detail + comments sheet, share sheet, story viewer, other users' profiles | `/post/:id`, `/story/:id`, `/user/:id` |
| Creator Studio | Overview, Reels, Posts, Drafts, Analytics, Reach, Earnings (reward pool, never "₹ per view"), Copyright and music (licence status of tracks used, reuse of original audio) | `/creator-studio`, `/creator-studio/{reels,posts,drafts,analytics,reach,earnings,music}` |
| Payout (demo) | Payout Center (Overview · Methods · Verification · History), identity (KYC) flow, add bank account, request payout, tax information. Bank and large-payout changes need password + OTP. **No money moves** | `/creator-studio/payout`, `…/verification`, `…/bank`, `…/history`, `…/tax`, `…/request` |
| Business | Business profile, Promote flow (7 steps, demo campaign, **no money moves**) | `/business/:id`, `/promote` |
| Social | Notifications, Messages list, Chat | `/notifications`, `/messages`, `/messages/:id` |
| Trust | Verification, Safety Center, Report flow, Blocked / Muted accounts | `/verification`, `/safety`, `/settings/blocked`, `/settings/muted` |
| Settings | Theme, language, privacy, notifications, legal/info pages | `/settings`, `/settings/:kind`, `/info/:topic` |

Reach thresholds are configuration, not constants in widgets: **10,001 / 100,001 / 1,000,001**
(`ReachConfig.demo()`). Live eligibility: 5,000 followers, 30 days, 2FA, trust-eligible, no
violation, age-eligible (`LiveEligibilityConfig`).

## C. Reusable components

| Component | Purpose |
|---|---|
| `ReachLadder`, `ReachLevelBadge`, `RisingBanner`, `showReachUnlockCelebration` | The Reach Ladder visuals; ladder rescales below ~290 px |
| `PostCard`, `PostTile`, `ReelTile`, `StoryRing`, `StoryStrip` | Content surfaces |
| `BlocksButton`, `BlocksChip`, `BlocksAvatar`, `BlocksMark` | Design-system primitives (≥ 48 dp targets) |
| `BlocksImage` + `ImageVariant` / `ImageUrlResolver` | The only way images are shown: decode-sized, cached, placeholder, `demo://` procedural art |
| `DemoArt` | Procedural artwork so the demo needs no image files or network |
| `PagedNotifier<T>`, `LoadMoreFooter`, `pagedGridSlivers`, `PinnedTabStripDelegate` | Cursor pagination with de-duplicated load-more, refresh, prepend |
| `state_views` (loading / empty / error+retry), `ResponsiveCenter`, `HeroBackground`, `showAppSnack` | Every screen has loading, empty and error states |
| `FollowButton`, `InteractionsController`, `FollowingController` | Like / follow overlays keyed by content id (optimistic, with rollback) |
| `ReelPlayerPool` + `ReelPlayback` interface | Bounded video decoders; swap the demo playback for a real player here |
| `SettingsCard`, `SettingsNavTile`, `SettingsSwitchTile` | Settings building blocks |

## D. Mock repositories

`lib/data/repositories/` defines 34 interfaces; `lib/data/mock/` implements each one.

`Auth` · `User` · `Feed` · `Post` · `Story` · `Reel` · `Notification` · `Message` · `Business` ·
`Reach` · `Creator` · `Ad` · `Verification` · `Moderation` · `Explore`

Added with the account-security and profile work: `Security` · `Session` · `Password` ·
`PasswordReset` · `Profile` · `SecurityNotificationService`.

Added with reels, music, KYC and payout: `MediaLibrary` · `MediaProcessing` · `MediaUpload` ·
`ReelDraft` · `ReelPublish` · `Music` · `CreatorConfig` · `CreatorInsights` · `CreatorMusic` · `Kyc` ·
`BankAccount` · `Payout` · `Tax` · `StepUp`.

`SecurityDemoService` and `CreatorDemoService` (`lib/data/services/`) exist only to steer the mock
server from the demo lab; delete them with the mocks.

How it stays small in memory (important for scale-readiness): `MockFactory` **generates** items
deterministically from their ids (FNV-1a hash), so nothing large is stored. `MockWorld` holds
only the mutable bits (your posts, likes, follows, blocks, reports, campaigns). Page size is capped
at 50 and every list method takes `cursor` + `limit`. Simulated latency is 280 ms
(`mockLatencyProvider`; tests set it to zero).

## E. Dependencies (and why)

| Package | Why |
|---|---|
| `flutter_riverpod` | State and dependency injection; `.select` for minimal rebuilds; overridable in tests |
| `go_router` | Declarative routes, redirects, `StatefulShellRoute` (each tab keeps its own stack and scroll) |
| `equatable` | Value equality for immutable models (cheap diffing, simple tests) |
| `shared_preferences` | Persists only non-sensitive flags: onboarding done, theme, language, toggles |
| `cached_network_image` | Disk/memory cached, decode-sized network images (used when real URLs replace `demo://`) |
| `intl` + `flutter_localizations` | Required by the generated ARB localisations (messages, plurals). Indian digit grouping is done by `formatRupees` / `compactCount` |
| `audioplayers` | Reel sound (muted by default) and the music preview in the studio, behind `ReelSoundEngine` |
| `image_picker` | Profile photo from camera / gallery behind a small picker interface |
| `cupertino_icons` | Flutter template default; not used by the app UI |
| dev: `flutter_test`, `fake_async`, `flutter_lints` | Tests, deterministic timers, lints |

Deliberately **not** added: any HTTP client, Firebase, payment SDK, ads SDK, analytics, `video_player`.

## F. Tests (899)

- **Domain rules**: Reach D→S, S→N, N→G; invalid post; creator earnings; live eligibility; campaign
  rules; hashtag extraction; rupee/compact formatting.
- **Behaviour**: follow/unfollow, like/unlike (optimistic + rollback), paging de-duplication,
  reel pool never exceeds 3 and pauses off-tab, report/block/mute flows, settings persistence,
  promote flow end to end, demo navigation flow (splash → onboarding → auth → home → every tab).
- **Localisation**: ARB key parity across en/hi/te, a scan that fails on hard-coded `Text('…')`,
  every screen rendered in all three languages.
- **Accessibility**: Flutter's tap-target (Android 48 dp, iOS 44 pt), labelled-target and text
  contrast guidelines run against every route, and against the interactive states of the creator
  screens (each editor tool with clips loaded, the media and music sheets, half-filled forms,
  finished / failed / rejected publishes, the identity and bank steps).
- **Layout stress**: key screens at 360×740 with 1.6× text scale throw no overflow.
- **Reels, media and money**: timeline operations, trim / split / reorder rules, optimiser maths,
  the chunked upload with failure and resume, the publish pipeline incl. moderation rejection,
  music clip rules, KYC / bank / payout validators and server rules (step-up tokens, limits,
  holds, security events), full widget flows for the editor, Creator Studio, identity, add bank,
  request payout, tax and the demo lab.

## Known limits (be aware)

- **Video is simulated.** Reels play procedural frames through the `ReelPlayback` interface; there
  is no `video_player`/HLS yet. The pool, lifecycle and UI are real; only the decoder is a stand-in.
  The reel editor works on generated clips: nothing is decoded, compressed or uploaded for real, and
  "record" adds a generated clip. See `docs/CREATOR_REELS_MONEY.md` section 9.
- **KYC, bank and payout are simulated.** Status changes follow an injected clock; no document is
  read, no bank is called, no money moves. Identity documents are never stored by the app.
- **All data is mock** and resets when the app restarts (only the flags listed above persist).
- **Not yet profiled or run on a physical device.** Verification so far: `flutter analyze`, 899
  widget/unit tests, and a Flutter web build looked at in a browser. `flutter build apk --release`
  succeeds with the native plugins (`audioplayers`, `image_picker`): 63.6 MB at
  `build/app/outputs/flutter-apk/app-release.apk`. Installing and exercising that APK on a phone, and
  any iOS build, have not been done.
- **Hindi and Telugu strings are first-pass translations** and need a native-speaker review.
- Share links use the placeholder domain `blocks.example` (`share_sheet.dart`,
  `profile_screen.dart`); production should read the deep-link base from configuration.
- `AppConfig.enableLogging` exists but nothing logs yet.
- Widget tests use the "Ahem" test font, which is wider than real fonts, so the layout tests are
  deliberately harsher than a real device.
