# BLOCKS — Advanced Reels, Media Processing, Music, KYC & Payout

Third delivery on top of the finished demo (see `DELIVERY_PROTOCOL.md`, `SECURITY_PROFILE_REELS.md`).
Still **frontend-only**: everything a server would do (transcoding, moderation, identity review, bank
checks, payout rails, reward maths) is simulated by mock repositories behind interfaces. Nothing here
talks to a network, verifies a real document, moves money or processes real media.

The loop this delivery closes: **Create → Edit → Publish → Reach → Grow → Earn → Verify → Payout.**

## 1. What is real and what is simulated

| Area | Real in the app (Dart, tested) | Simulated by a mock "server" |
|------|-------------------------------|-------------------------------|
| Reel editor | Timeline model: add, reorder, trim, split, duplicate, delete, replace, per-clip volume/filter/adjustments/transition; text, sticker and caption layers, each with a timing lane under the clip row; music slice; cover; validation | Media itself: the library is generated artwork, "record" adds a generated clip |
| Filters / adjustments | 14 BLOCKS filters with intensity, 9 adjustments (brightness to vignette), as colour-matrix maths applied to the preview | – |
| Optimisation | Quality presets, bitrate-based size estimate, resolution ladder, the Inspect → Validate → Compress → Resize → Thumbnail → Preview → Upload-ready stage machine | No encoder runs; sizes are computed |
| Upload | Chunked, resumable upload with per-chunk progress, failure injection, resume from the last good chunk; the server completes a session and issues the receipt a publish needs; walking away abandons the open sessions (`cancelUpload`) | The chunks go nowhere |
| Publish | Validate → prepare → upload → submit → watch; draft saved first and kept on failure | Server processing and moderation stages and their outcomes |
| Music | Search (title, artist, language, genre), 17 categories, trending with reel counts, rights model, 5–30 s clip chooser; Copyright and music screen (tracks used, licence status, reuse of original audio) | Catalogue, rights decisions and "audio" (a synthesised tone) |
| Analytics / earnings | Display, formatting, "Estimated" labelling | All figures; the reward-pool maths |
| Identity (KYC) | Forms (incl. date of birth and business type), validators, masking, statuses | The review, its timing and outcome; the minimum age |
| Bank account | Validators, IFSC lookup UI, state handling | IFSC directory, name matching, verification |
| Payout | Eligibility checklist, amount rules, confirmation, history | Balance, statuses and timing |
| Step-up | The UI and the "token bound to a purpose, used once" contract | Password check, OTP, token issuing and consumption |

## 2. Routes

| Route | Screen |
|-------|--------|
| `/create/reel` | Reel editor (clips, trim, music, text, stickers, filters, adjust, transitions, cover) |
| `/create/reel/music` | Music library |
| `/create/reel/details` | Caption, hashtags, location, tag people, audience, comments / remix / sharing, Reach Ladder note |
| `/create/reel/publishing` | Optimise → upload → process → moderate → published / failed |
| `/creator-studio` | Overview |
| `/creator-studio/reels` · `/posts` · `/drafts` | Content |
| `/creator-studio/analytics` · `/reach` · `/earnings` | Insights |
| `/creator-studio/music` | Copyright and music |
| `/creator-studio/payout` | Payout Center (Overview · Methods · Verification · History) |
| `/creator-studio/payout/verification` · `/verification/start` | Identity status · identity flow |
| `/creator-studio/payout/bank` · `/bank/add` | Bank accounts · add account |
| `/creator-studio/payout/request` · `/history` · `/tax` | Request payout · history · tax information |
| `/settings/security/demo` | Demo lab, now with a "Creator and payouts" section |

The editor, music, details and publishing routes are registered on the root navigator so the editor
is full-screen without the tab bar.

## 3. Architecture

```
UI (features/*/presentation)
  → controllers / providers (features/*/application)
    → repository INTERFACES (data/repositories)
      → Mock*Repository over MockWorld (today)   |   Api*Repository (later)
```

Pure domain rules live in `features/*/domain` and have no Flutter or I/O dependencies:
`ReelTimeline`, `ReelValidator`, `MediaOptimizer`, `ReelLook` / `ColorMatrices` / `ReelFilters`,
`StickerCatalog`, `MusicClipRules`, `BankAccountValidator`, `PayoutRules`, `KycFormValidator`,
`NameMatcher`, `id_mask`, `number_format`.

Config comes from the server, never from widgets: `ReelConfig` (max length, clips, photos, size,
duration options), `KycConfig` (documents per subject, patterns, file types and size, validity),
`PayoutConfig` (minimum, delivery estimate, step-up amount, post-bank-change hold). The demo values
are in `ReelConfig.demo()`, `defaultKycConfig`, `PayoutConfig.demo()`.

Mock time is the injected `clockProvider`. KYC and payout statuses advance with that clock (e.g.
identity: pending → under review → outcome; payout: requested → processing → outcome), so tests move
time instead of sleeping and a real server's pushed/polled status is the only change needed later.

## 4. Pipelines

### 4.1 Reel publishing

```
validate (ReelValidator)  → save draft
  → for each unique asset: inspect → compress → resize → thumbnail → upload-ready
  → create upload session → chunked upload (resumable)
  → submit publish job  → watch status: serverProcessing → moderation → published | failed
  → on success delete the draft; on failure keep it (Retry / Save Draft)
```

The client is never trusted: it validates for the user's benefit, and the server must re-inspect the
file, re-check duration, size and codecs, and run its own moderation.

### 4.2 Money

```
Identity (KYC) ──verified──► Add bank account ──► Request payout ──► history / status
        │                         │ step-up           │ step-up if ≥ PayoutConfig.stepUpAmount
        └─ rejected / action      └─ security event   └─ eligibility re-checked on the server
           required / expired        + e-mail + notification (+ optional hold)
```

Eligibility (identity verified, bank verified, minimum balance, no active hold, good standing) is
shown as a checklist, but only the server decides. "Estimated" is shown wherever a figure is not final.

## 5. Production migration points

Everything is wired in `lib/data/providers.dart`; the non-mock branch currently throws
`UnimplementedError('Api… not implemented yet')`. Implement the class and return it there; no widget
or controller changes are needed. Endpoints below are a **suggested** contract, not an existing one.

| Interface (`data/repositories`) | Future implementation | Suggested backend |
|---|---|---|
| `MediaLibraryRepository` | Device gallery via platform APIs (`photo_manager` or similar) | – (on-device); `record()` → camera plugin |
| `MediaProcessingRepository` | On-device inspect + compress (platform channel / FFmpeg) | – (on-device); server re-inspects |
| `MediaUploadRepository` | `ApiMediaUploadRepository` using tus / S3 multipart with signed URLs | `POST /uploads` → session + signed part URLs; `PUT` parts; `GET /uploads/{id}`; `POST /uploads/{id}/complete` → receipt; `DELETE /uploads/{id}` |
| `ReelPublishRepository` | `ApiReelPublishRepository` | `POST /reels` → job; status over SSE/WebSocket or `GET /reels/jobs/{id}` polling |
| `ReelDraftRepository` | `ApiReelDraftRepository` (drafts sync across devices) | `GET/PUT/DELETE /drafts`, `POST /drafts/{id}/duplicate` |
| `MusicRepository` | `ApiMusicRepository` | `GET /music/trending`, `GET /music?q=&category=&cursor=`, `GET /music/{id}`; previews via signed CDN URLs |
| `CreatorConfigRepository` | `ApiCreatorConfigRepository` | `GET /config/reels`, `/config/kyc`, `/config/payout` (per country / tier) |
| `CreatorInsightsRepository` | `ApiCreatorInsightsRepository` | `GET /creator/earnings`, `/creator/analytics?range=`, `/reels/{id}/performance` |
| `CreatorMusicRepository` | `ApiCreatorMusicRepository` | `GET /creator/music` (tracks used + rights status, original audio); `PUT /creator/audio/{id}/reuse` |
| `KycRepository` | `ApiKycRepository` | `GET /kyc`, `POST /kyc/submissions` (documents go straight to private storage via signed upload, see 6) |
| `BankAccountRepository` | `ApiBankAccountRepository` | `GET/POST/DELETE /payout/accounts`, `POST …/primary`, `GET /ifsc/{code}` |
| `PayoutRepository` | `ApiPayoutRepository` | `GET /payout/overview`, `GET /payout/requests`, `POST /payout/requests` (idempotency key) |
| `TaxRepository` | `ApiTaxRepository` | `GET/PUT /payout/tax` (the GET also lists the statements and certificates the provider has issued) |
| `StepUpRepository` | `ApiStepUpRepository` | `POST /auth/step-up`, `…/resend`, `…/verify` → short-lived token bound to a purpose |
| `CreatorDemoService` | **Delete** (demo only) | – |

Other swaps:

- **Audio.** `studioSoundEngineProvider` plays a synthesised tone. Use signed preview URLs and keep the
  engine behind the same interface; `ReelSoundEngine` is separate so the Reels tab and the studio never
  fight over audio.
- **Video preview.** The editor previews clips as generated frames. Replace `ClipVisual` / `ReelPreview`
  with a decoder (`video_player` or a texture plugin); the timeline, filters (colour matrices apply to
  video too) and overlays stay as they are. Keep the "≤ 3 live players" rule.
- **Reward maths.** The Creator Studio shows server figures only. `CreatorEarningsCalculator` stays a
  preview helper; do not pay from it.
- **Localisation.** Hindi and Telugu strings for the new screens are first-pass and need native review.

## 6. Security review (new surface)

| Area | Decision in this delivery | Server must |
|------|---------------------------|-------------|
| KYC documents | Never written to `SharedPreferences` or disk by the app. Only a file name and size are held in memory while the form is open (the demo reads no real file). No document is ever shown through an image URL | Receive via signed upload to private storage; encrypt; RBAC; audit log; retention and deletion policy |
| Document numbers | Entered once, validated by pattern, then only a **masked** form (`XXXX XXXX 4821`) is held or shown. Never logged, never in routes or query strings | Store encrypted or tokenised; never return in full |
| Upload receipts | A publish names the uploads it uses by receipt. Only a receipt the server issued when it completed the session counts, so a client cannot claim a file arrived | Issue receipts at `complete`, check them at publish, expire abandoned sessions |
| Date of birth | Asked once on the identity form, sent with the submission and never shown again. The minimum age is server configuration (`KycConfig.minimumAge`), not a constant in the app | Validate age, store encrypted, never return it |
| Verification state | The app shows only the status (Pending / Under review / Verified / Rejected / Action required / Expired). There is no client-side `isKycVerified`; the UI reads status from the repository each time | Be the only authority; re-check on every payout |
| Bank account | Account number is masked after saving; confirm-number field; IFSC format check; name matching and verification are the server's | Penny-drop / name match with the bank; store encrypted |
| Changes to money details | Adding, changing or removing an account, saving tax info, and payouts ≥ `stepUpAmount` need step-up: password, then OTP, giving a token **bound to that purpose and consumed once** | Verify, bind, expire (minutes), single-use, rate-limit |
| Change alerts | Every payout-account change raises a critical security event + e-mail + notification, and can start a configurable hold | Send real e-mail/push; enforce the hold |
| Compliance | DPDP, RBI, TDS and music-licensing specifics are **configuration**, not code. The app does no tax calculation and makes no legal claims | Legal review, regional config |
| Music | Tracks carry a rights type (platform-owned, licensed, creator-owned, royalty-free, restricted) and a country list. The mock catalogue deliberately contains restricted and region-locked tracks, and the mock server's rights check removes them, so the client never has to decide | Enforce per region / platform; fingerprint uploads |
| Media | Client optimisation is a courtesy to save data; the file is never trusted | Re-inspect, transcode, scan, moderate |
| Idempotency | **Not modelled in the mocks.** Add an `Idempotency-Key` header to `requestPayout`, `submit` (publish) and `addAccount` in the `Api*` classes so a retry after a timeout cannot pay or publish twice | Store and honour keys |
| Logging | Nothing in the new code logs document numbers, account numbers or tokens | Keep it that way when `enableLogging` is wired |

## 7. Performance notes

- Heavy work is not on the UI thread by design: no pixel processing in Dart. Filters are a single
  `ColorFilter.matrix` per clip; thumbnails are generated art, not decoded video.
- The timeline is a lazy, keyed list; reorder uses `ReorderableListView` with a stable id per clip.
- Streams (upload progress, publish status, polling) are cancelled on dispose; polling uses a single
  `PollWhile` that stops when the status is final or the screen is gone.
- Upload progress updates are throttled by chunk, not by byte.
- Music results are cursor-paginated (`PagedResult`) like every other list.
- **Not measured:** frame times with real video, memory with many large clips, real encoder speed and
  battery. These need a profile-mode run on a mid-range Android phone once a decoder exists.

## 8. Tests

- Domain: timeline operations (incl. reorder index conventions), validator, optimiser, look maths,
  stickers, music clip rules (min/max/track bounds under any drag), bank / payout / KYC validators,
  name matching, id masking.
- Server rules (through providers, with a controllable clock): reel pipeline incl. failure, resume and
  moderation rejection; KYC outcomes; bank add / remove / primary; payout limits, step-up and holds;
  security events raised.
- Flows: editor, publishing states, drafts, Creator Studio, payout centre, identity flow, add bank,
  request payout, tax info, demo lab.
- Cross-cutting: ARB parity (en/hi/te) and a hard-coded-text scan; every new route rendered in all
  three languages and at 1.6× text on 360 px; Flutter's tap-target, label and contrast guidelines on
  every new route **and** on the interactive states (each editor tool with clips loaded, sheets,
  half-filled forms, finished / failed / rejected publishes).

## 9. Known limitations

- Media is generated artwork; the editor does not decode or play real video, and "record" is simulated.
- No real compression, thumbnailing or upload happens; sizes and progress are modelled.
- Audio preview is synthesised, not the real track.
- No real KYC, bank verification, tax or payout; statuses are driven by the injected clock.
- Reward and analytics figures are mock data. The reward pool is explained, never "₹ per view".
- The date of birth is chosen with Flutter's own date picker, whose day cells are 47.7 dp wide on a 390 dp phone (just under the 48 dp guideline). That component is not swept by the accessibility tests.
- The Copyright and music screen shows the server's rights decisions for the demo catalogue; it does not model takedown notices or disputes.
- Tax documents are listed, not downloadable: there are no real files.
- Hindi and Telugu copy is first-pass.
- Not profiled or run on a device. `flutter build apk --release` does succeed with the native plugins
  (`audioplayers`, `image_picker`); installing and exercising the APK on a phone has not been done.
