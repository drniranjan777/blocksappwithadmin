# BLOCKS Flutter app

India-first social platform. It runs two ways from one code base: the **demo** (the default,
`DEMO_MODE=true`: everything comes from `Mock*Repository`, no server) and **live**
(`DEMO_MODE=false` + `API_BASE_URL`: the `Api*Repository` classes in `lib/data/api/` talk to the real
backend). Read `docs/DELIVERY_PROTOCOL.md` first: it defines the architecture, the phase plan, the
stopping protocol and the exact navigation flow. Which interfaces are live and which are not:
`../docs/IMPLEMENTATION_PLAN.md`, Stage 10.

## Rules
- No secrets in the app or in source control. Data comes from a repository interface: `Mock*` in
  the demo, `Api*` when live. A repository the live service does not offer yet is an
  `Unavailable*` (it fails every call with `NOT_AVAILABLE`); it is never allowed to fall back to
  demo data.
- The server decides: reach level, verification, balance, eligibility. The app may preview a
  rule, never grant anything. Sensitive identifiers are never stored or logged by the app.
- Tokens live only in `TokenStore` (Keychain / Keystore); never log a header, body, token or code.
  Repository methods that return a `Future` must be `async` (a plain `=> throw` throws while
  being called, which no `await`/`catchError` on the returned future will catch).
- After a sign-out the whole provider scope is replaced (`SessionScope`). Do not keep per-person
  data in a file-level global (a `GlobalKey`, a static cache): it would survive the reset.
- UI depends on repository interfaces only; never import `data/mock` from a widget
  (providers in `features/*/application` wire the implementation).
- No demo values (names, counts, thresholds) hard-coded in widgets. Reach thresholds
  live in `ReachConfig`, live-eligibility thresholds in a config class.
- Strings via ARB (`lib/l10n/app_*.arb`, then `flutter gen-l10n`), never inline.
- Colours/spacing from `app/theme` tokens; icons from Material icon widgets, no emoji in UI.
- Every screen: loading, empty, error+retry. Lists are lazy and cursor-paginated.
- Images only through `BlocksImage`; max 3 video players alive.
- Do not copy another app's UI, icons or assets.

## Commands
```
flutter pub get
dart format lib test
flutter analyze
flutter test
flutter run            # demo: add --dart-define=APP_ENV=demo
flutter run --dart-define=APP_ENV=staging --dart-define=DEMO_MODE=false \
            --dart-define=API_BASE_URL=http://10.0.2.2:4000    # live (see .env.example)
# Opt-in: the real repositories and the whole app against a RUNNING development backend
# (creates throw-away accounts; never point at a real database):
BLOCKS_LIVE_API=http://127.0.0.1:4000 flutter test test/live
```

## Status
All 8 phases of `docs/DELIVERY_PROTOCOL.md` are complete, plus the account-security / profile
delivery (`docs/SECURITY_PROFILE_REELS.md`) and the reel editor / media / music / Creator Studio /
KYC / bank / payout delivery (`docs/CREATOR_REELS_MONEY.md`): analyzer clean, 1,136 tests (899 before
the API integration) plus 40 opt-in live tests (last run 2026-10-09). Live integration (Stages 10-11): sign-up/sign-in/two-step
codes, profile and photo, feed, posts (text and photo), comments, engagement, follows, notifications,
password, devices, login activity, contacts, and reporting/blocking/muting are connected; stories, messages, business, ads,
explore, appeals, the reel and creator studios, KYC, bank, payouts and turning two-step sign-in on are not
(they answer "not available" in a live build).
Production plan, security review and performance review: `docs/PRODUCTION_MIGRATION.md`;
per-interface API migration points for the creator side: `docs/CREATOR_REELS_MONEY.md` section 5.

Creator/money rules to keep: KYC documents and full document or account numbers are never stored
or logged by the app (masked forms only); verification status comes from the repository, never a
client flag; bank changes and large payouts need step-up; compliance values (limits, documents,
holds, delivery estimates) are server configuration, not constants in widgets. Use `pump` (not
`pumpAndSettle`) on screens that poll, and give a button two frames before sampling contrast.

## Workflow
For any new change: `dart format lib test`, `flutter analyze`, `flutter test` must all pass
before you report done. Work in small increments and, for a multi-phase task, summarise at
each phase boundary and stop for "continue" unless the owner has asked for automode.
