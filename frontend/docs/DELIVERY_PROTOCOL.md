# BLOCKS Flutter Demo — Delivery Protocol

Frontend-only demo. No backend, API, auth server, payments, ads, live
streaming, push, AI moderation, KYC or payouts. Everything runs on local mock
data behind repository interfaces so a real API can replace it later without
touching UI code.

## 1. Architecture summary

```
UI (screens/widgets)
  -> Controller / Notifier (Riverpod)          features/<f>/application
    -> Repository INTERFACE                    features/<f>/domain (or data/repositories)
      -> MockRepository (today)                data/mock
      -> ApiRepository   (later)               data/api   <- only this is added
```

* **Feature-first**: `lib/features/<feature>/{domain,application,presentation}`.
* **Shared**: `lib/core` (widgets, utils, errors, services), `lib/app`
  (theme, router, config). `lib/data` holds models, datasources, repositories.
* **State**: Riverpod `Notifier` / `AsyncNotifier`; widgets `ref.watch(...).select`
  to rebuild minimally. No logic or mock data inside widgets.
* **Navigation**: `go_router`, `StatefulShellRoute.indexedStack` (each tab keeps
  its own stack and scroll position); routes live in `Routes`.
* **Config**: `--dart-define` via `AppConfig`; `.env.example` documents keys.
  No secrets in the repo.
* **i18n**: ARB files (`en`, `hi`, `te`) -> generated `AppLocalizations`.
* **Scale-readiness rules** (apply to every phase): cursor-paginated repository
  methods (`cursor`, `limit`), `ListView.builder`/`Sliver*`, never hold a full
  dataset in a screen, `BlocksImage` for all images (cached, sized, variants),
  max 3 live video players (previous/current/next), dispose every controller,
  heavy local work in isolates, debounce search.

## 2. Phased delivery

**Status: all phases complete** (214 tests green at the end of phase 8; 899 after the later
security, reels and creator-money deliveries; `flutter analyze` clean). The owner
authorised running phases 2-8 back to back ("automode"); format / analyze / test were still run
at every phase boundary.

| Phase | Scope (prompt stage numbers) | Exit criteria | Status |
|------:|------------------------------|---------------|:------:|
| 0 | Inspect project, architecture summary | Summary approved | done |
| **1** | Architecture, design system, splash, onboarding, navigation shell, demo entry (1-5) | analyze/test clean, flow below works | done |
| 2 | Models, repository interfaces, mock repositories, providers, demo user, reach config (6-7) | Repo + reach tests pass | done |
| 3 | Home feed, post card, Reach Ladder, Rising, stories (8-11, 14) | Feeds paginate; ladder animates; unlock celebration | done |
| 4 | Explore, district discovery, Reels (12-13) | Video pool limit verified | done |
| 5 | Create (post/reel/story/live-eligibility), Profile (15-16) | Live eligibility tests pass | done |
| 6 | Creator Studio, Business profile, Promote flow (17-19) | Earnings calc tests pass | done |
| 7 | Notifications, Messages, Verification, Safety Center, Settings (20-23) | Report flow works | done |
| 8 | Localisation complete, performance pass, tests, UI polish (24-27) | Release checklist below | done, see caveats |

## 3. Stopping protocol

At the end of **every** phase the agent MUST, in this order:

1. `dart format lib test`
2. `flutter analyze` — zero issues
3. `flutter test` — all green
4. Review against the scale-readiness rules above (list any deviation)
5. Report: what was built, files touched, screens now reachable, known gaps
6. **STOP.** Do not begin the next phase until the owner replies "continue"
   (or gives changes).

Hard stops (halt mid-phase and ask): a dependency/licence question, a
requirement conflict, any need for a secret/credential, or a change that would
break an earlier phase's tests.

Never: add a backend call, commit secrets, hard-code demo values in widgets,
copy another app's UI/assets, or leave a screen without loading/empty/error
states.

## 4. Exact demo navigation flow

```
App launch
  └─ SPLASH (/)                      ~3 s: marks rise -> wordmark -> "Made in India ♥" -> loader
       │   (reduce-motion: static, ~0.9 s)
       ├─ session.isSignedIn ................................. -> HOME
       ├─ onboardingCompleted && !isSignedIn ................. -> AUTH
       └─ first launch ....................................... -> ONBOARDING

ONBOARDING (/onboarding)  5 pages: Welcome · District→World · Create/Share/Grow · Earn · Business
  ├─ Next (pages 1-4) ........................... next page
  ├─ Skip (pages 1-4) ........ mark onboarding done -> AUTH
  └─ Page 5
       ├─ Get Started ......... mark onboarding done -> AUTH
       └─ Explore Demo ........ start demo session   -> HOME

AUTH (/auth)   demo user card (Aarav Kumar · @aarav.blocks · S1)
  └─ Continue as Demo User .... start demo session   -> HOME

HOME SHELL (/home)  bottom nav: Home · Explore · [Create] · Reels · Profile
  ├─ Home (/home)       feeds: Following · For You · Rising · Near You · India
  ├─ Explore (/explore) search · trending · district→state→India→global · categories
  ├─ Create ( + )       pushes /create full-screen ABOVE the shell (no nav bar)
  │                     Post · Reel · Story · Go Live (eligibility)
  ├─ Reels (/reels)     vertical full-screen video
  └─ Profile (/profile) own profile; Creator Studio, Business, Verification,
                        Safety Center, Settings are pushed from here

Global rules
  • Signed-out user hitting any shell/create route is redirected to AUTH/ONBOARDING.
  • Signed-in user hitting /onboarding or /auth is redirected to HOME.
  • Re-tapping the active tab resets that tab to its root.
  • Logout (Settings) -> signOut() -> AUTH (onboarding is not shown again).
```

## 5. Release checklist (Phase 8)

* [x] `flutter analyze` / `flutter test` clean; coverage on reach, live eligibility,
  earnings, follow/like, repositories.
* [ ] Profile-mode run on a low-end Android device: no jank on feed/reels.
  **Not done** - needs a physical device (see `PRODUCTION_MIGRATION.md` section 3.2).
* [ ] Memory: scroll 500 mock posts, confirm image cache and players stay bounded.
  **Bounded by construction and unit-tested** (image cache 150 items / 80 MB, reel pool <= 3,
  page size <= 50), but **not measured** on a device.
* [~] Accessibility: Flutter tap-target, label and contrast guidelines pass on 15 screens;
  key screens survive 1.6x text on 360 px. **Not done:** manual TalkBack / VoiceOver pass and
  a 2.0x text-scale run.
* [~] Dark mode and `en`/`hi`/`te`: every screen renders without errors in all three languages
  (automated). **Not done:** a visual review of every screen in dark mode, and a native-speaker
  review of the Hindi and Telugu copy.
