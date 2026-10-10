# BLOCKS — Profile, Account Security & Reels-first experience

Second delivery on top of the finished demo (see `DELIVERY_PROTOCOL.md`). Still **frontend-only**:
every "server" behaviour (OTP, lock-out, sessions, e-mail alerts, uploads) runs in mock repositories
behind interfaces, so real services can replace them without UI changes.

## 1. Implementation priority plan

| # | Phase | Why this order | Exit criteria |
|--:|-------|----------------|---------------|
| 1 | **Reels-first launch**: land on Reels after splash, muted by default, sound control, lifecycle pause, For You / Following | Mandatory, most visible, touches the router every other phase depends on | Reels opens after splash; first reel muted; tests green |
| 2 | **Security foundation**: models, repository interfaces, mock "server" state, notification service, providers, routes | Everything else consumes these | Interfaces + mocks unit-tested |
| 3 | **Account security core**: Security hub, Change Password (+ strength), Devices, Login Activity, 2FA | Highest-value screens, no OTP needed | Flows work end to end |
| 4 | **Sign-in & attack response**: password sign-in, max failed attempts, temporary protection, alerts, e-mail outbox, Security Alert screen, demo lab | Depends on 2–3 | 5 wrong passwords → protected + event + notification + e-mail |
| 5 | **Recovery & identifiers**: forgot password by e-mail / phone, change e-mail, change phone (mock OTP) | Reuses OTP widget and repos from 4 | All four flows complete |
| 6 | **Profile**: Edit Profile, photo update flow, profile + settings menus | Independent, lowest risk | Edits reflect immediately |
| 7 | **Hardening**: en/hi/te strings, accessibility, layout stress, tests, docs, APK | Last, covers everything | analyze / test clean |

## 2. Exact routes

| Route | Screen | Access |
|-------|--------|--------|
| `/` | Splash → **`/reels`** when signed in | public |
| `/onboarding`, `/auth` | Onboarding, sign-in entry (demo user card + "Sign in with password") | public |
| `/auth/sign-in` | Password sign-in | public |
| `/auth/forgot` | Forgot password (e-mail or phone) | public |
| `/home` `/explore` `/reels` `/profile` | Tabs (**Reels is the landing tab**) | signed in |
| `/profile/edit` | Edit Profile | signed in |
| `/settings` | Settings (Account · Security · Privacy · …) | signed in |
| `/settings/security` | Security hub | signed in |
| `/settings/security/password` | Change Password | signed in |
| `/settings/security/reset-password` | Forgot / reset password (in-app variant) | signed in |
| `/settings/security/email` | Change e-mail | signed in |
| `/settings/security/phone` | Change phone | signed in |
| `/settings/security/two-factor` | Two-factor authentication | signed in |
| `/settings/security/activity` | Login Activity (All · Successful · Failed · Suspicious) | signed in |
| `/settings/security/devices` | Logged-in devices | signed in |
| `/settings/security/notifications` | Security notifications + sent-alert log | signed in |
| `/settings/security/alert/:id` | Security Alert (Secure Account · Review Devices · This Was Me) | signed in |
| `/settings/security/demo` | Security demo lab (scenarios A–H) | signed in, demo builds |

Static `security/...` segments are registered before `/settings/:kind` so the generic route never
swallows them. Signed-out users are redirected to onboarding / auth; signed-in users hitting any
`/auth*` or `/onboarding` route are redirected to `/reels`.

## 3. Exact demo navigation

```
Launch ─ Splash (~2.6 s) ──┬─ signed in ............................ /reels   (muted, first reel plays)
                           ├─ onboarded, signed out ................ /auth
                           └─ first launch ......................... /onboarding

/auth ─┬─ Continue as Demo User ................................... /reels
       └─ Sign in with password ─ /auth/sign-in
              ├─ correct credentials .............................. /reels
              ├─ wrong password ................................... inline error (+ "n attempts left")
              ├─ max failed attempts ..... "temporarily protected" panel + Reset password
              └─ Forgot password? ─ /auth/forgot
                     method (E-mail | Phone) → destination → code → new password → success → /auth/sign-in

Profile ─ ☰ ─┬─ Edit Profile ......................... /profile/edit  (photo sheet, fields, save)
             ├─ Security ............................. /settings/security
             └─ Settings ............................. /settings

Settings ─ Security ─┬─ Change Password → (forgot current? → reset flow)
                     ├─ Two-Factor Authentication
                     ├─ Login Activity ─ tap a suspicious event → Security Alert
                     ├─ Devices ─ Log Out / Log Out From All Other Devices
                     ├─ Security Notifications
                     └─ Demo lab (A–H)            Settings ─ Account ─ Email / Phone → verify → confirm
Notifications ─ "Security alert" ─ tap ─ /settings/security/alert/:id
```

## 4. Security architecture — who is responsible for what

The app **demonstrates the UX**. Every control below must be **enforced by the backend** in production;
nothing the client reports (attempt counts, "verified", device id, IP, location) is trusted.

| Concern | Demo (mock) | Production owner |
|---------|-------------|------------------|
| Failed-attempt counting and lock-out | `MockAuthRepository` + `LoginAttemptTracker` keep the counter **server-side**; the UI only receives `LoginResult` | Auth service: per-account, per-IP and per-device rate limits; risk engine |
| Device / IP / location | Mock server supplies a device descriptor and *approximate* location | Derived server-side from the request (IP geo, TLS fingerprint, token claims) |
| OTP | Fixed demo code, shown on screen **only in demo builds** | Random, hashed at rest, expiry, attempt cap, resend cool-down, per-destination throttle |
| Password change / reset | Mock validates policy and current password | Argon2/bcrypt, breach-list check, session revocation, notify all channels |
| Sessions | `SessionRepository` mock list | Revoke refresh tokens / sessions server-side; short-lived access tokens |
| Security e-mail | `MockSecurityNotificationService` records an outbox | Backend mail provider; the app never holds mail credentials |
| Profile photo | `PickedPhoto` → progress stream → local preview | Client asks API for a short-lived **signed upload URL**; server validates MIME/extension/size, re-encodes, strips metadata, scans, renames, stores in **private** object storage, serves via CDN signed URLs. **No storage credentials in the app.** |
| 2FA | Mock enrol/verify | TOTP/SMS provider, recovery codes, rate limits |

Password rules (min length, upper, lower, digit, special) come from a `PasswordPolicy` the server will
supply; the client strength meter is advisory.

## 5. Reels architecture

```
ReelsScreen (PageView, vertical)
  ├─ ReelsFeed tab: For You | Following        → ReelsController (cursor-paged, per feed)
  ├─ ReelPlayerPool (≤ 3 players: prev/current/next, rest disposed)
  ├─ ReelsAudioController → AppSettings.reelsSoundEnabled  (default off = muted)
  └─ lifecycle: TickerMode (tab/route hidden) + WidgetsBindingObserver (background/inactive/lock)
```

Audio rules: a fresh app session is **always muted**; tapping the sound button unmutes and the
choice persists across reels, tabs and background/resume for the session; resuming never turns sound
on by itself. Production swaps the demo playback for an HLS/DASH player behind `ReelPlayback`.

## 6. Demo credentials and scenarios

Demo-only values live in `lib/data/mock/demo_credentials.dart` and are shown on the sign-in screen in
demo builds. The demo OTP is displayed on the verification screens in demo builds only.

| Scenario | Where | Result |
|----------|-------|--------|
| A Normal login | Demo lab / sign-in | Success event, no alert |
| B Wrong password | Demo lab / sign-in | Failed event, attempts-left warning |
| C Maximum failed attempts | Demo lab / sign-in | Protection, suspicious event, notification, e-mail |
| D Suspicious login | Demo lab | Alert notification + screen + e-mail |
| E Password changed | Demo lab / Change Password | Event + notification + e-mail |
| F New device login | Demo lab | New device in list, "New Login" notification |
| G Session revoked | Demo lab / Devices | Device removed, "Device Removed" notification |
| H Photo upload fails | Demo lab | Next photo upload shows the error + retry state |
