# BLOCKS staff console

The web console for BLOCKS staff: moderators, support, creator operations, identity and payout
reviewers, finance, auditors and administrators. Next.js 16 (App Router), React 19, Tailwind 4,
SWR, React Hook Form + Zod, Recharts. It looks and is organised like the prototype in
`../UI/admin.html` (sidebar groups that fold, ink sidebar, violet brand, Reach-level colours).

> This is **not** the Next.js most people remember. Before changing anything here, read the guides
> bundled in `node_modules/next/dist/docs/` (see `AGENTS.md`). The ones that matter most for this app:
> `01-app/02-guides/authentication.md`, `backend-for-frontend.md`, `content-security-policy.md` and
> `01-app/03-api-reference/03-file-conventions/proxy.md` (`middleware` was renamed `proxy`).

## How it works

```
browser ──► /api/auth/*   sign-in steps (login, verify, password, two-factor/setup|confirm, session, logout)
   │
   └──────► /api/bff/*    a pipe to  <API>/api/v1/admin/*   (adds the person's token, renews it, relays the answer)
```

* **The browser never sees a token.** Sign-in answers are turned into two `HttpOnly`,
  `SameSite=Strict` cookies (access and refresh); the page only learns who you are, what you may do and
  what is left of sign-in. In production the cookies are `Secure` and named with the `__Host-` prefix.
* **Nothing is decided here.** The menu is built from the permissions the API reports, but the API
  checks every call again; the console shows the API's own explanation when it refuses.
* **One refresh at a time.** A refresh token works once, so concurrent requests that notice an
  expired access token share one refresh (`src/lib/server/session.ts`).
* **Changes must come from this app's own pages:** `Origin` match, a marker header, and
  `Sec-Fetch-Site` (`src/lib/server/csrf.ts`).
* **`src/proxy.ts`** sends someone without a session to `/login` and sets a content-security-policy with
  a fresh nonce for every request. For that reason every page is rendered per request and Cache Components
  are off (`next.config.ts`).

More detail: `../docs/architecture.md` section 6b and `../docs/security.md` section 5a.

## Running it

You need the API running (`../backend/README.md`) and a staff account (`npm run admin:create` in
`backend/`). Then:

```bash
cd admin-frontend
npm install
cp .env.example .env.local        # then adjust
npm run dev                        # http://localhost:3000
```

First sign-in of a new account: sign in with the temporary password, choose your own (14+ characters),
scan the QR code with an authenticator app, enter its code, **save the backup codes**. Every later
sign-in needs a code.

```bash
npm run typecheck     # next typegen + tsc
npm run lint          # oxlint (React, a11y and Next rules)
npm run format        # prettier (with the Tailwind class sorter)
npm test              # vitest: node (server code) and jsdom (components)
npm run build && npm start
```

## Settings (`.env.local`, server side only)

| Variable | Meaning | Default |
|---|---|---|
| `BLOCKS_API_URL` | where the API runs (https in production, except localhost) | `http://localhost:4000` |
| `ALLOWED_ORIGINS` | extra browser origins allowed to send changes (only behind a proxy that rewrites the host) | none |
| `UPLOAD_ORIGINS` | where the browser may send files directly: the object-storage address (the API's own address in development) | none |
| `MEDIA_ORIGINS` | where photos and videos in review come from: the CDN | the API's origin |
| `COOKIE_SECURE` | force `Secure` cookies on or off | on in production |
| `TRUSTED_PROXY_HOPS` | reverse proxies in front of this app; the person's address is read from `X-Forwarded-For` counted from the right and forwarded to the API | `0` (ignore the header) |

Nothing here is a secret; the API is the only place secrets live. Variables are validated when first
read (a typo in an origin or a bad proxy count stops the app instead of widening a security policy).

## Deploying

* Run as a Node server (`next start`) behind HTTPS; cookies are `Secure`/`__Host-` in production.
* Set `TRUSTED_PROXY_HOPS`, and tell the API to trust this app as a proxy, or every staff member shares
  one address in rate limits and the audit log.
* Set `UPLOAD_ORIGINS` and `MEDIA_ORIGINS` to the storage and CDN addresses, or music uploads and media
  review will be blocked by the page policy.
* **Several instances:** route a person's requests to the same instance (sticky sessions). Token renewal is
  shared within one process only; see `../docs/security.md` section 9.
* The API's `CORS_ORIGINS` is irrelevant to this app (it calls the API from its server), but the API
  must be reachable from it.

## Layout

```
src/app/                 routes: /login, the console pages under (console)/, the two API routes
src/proxy.ts             door check + content-security-policy nonce
src/lib/server/          cookies, CSRF, API client, token renewal, client address (server only)
src/lib/client/          fetch wrapper, session context, data hooks, formatting, helpers
src/lib/reach-fields.ts  how the Reach settings document is laid out for editing
src/lib/nav.ts           the menu and the permission each item needs
src/components/ui/       buttons, tags, fields, tables, dialogs (native <dialog>), toasts
src/components/<module>/ one folder per console module
tests/unit/              server code and pure logic (node)
tests/components/        components (jsdom), with the session, API and data hooks replaced
```

## What is and is not covered

Built and tested: sign-in with mandatory two-step verification, dashboard, users, media review, music
library, Reach engine, earnings, identity checks, bank accounts, payouts, staff, roles, audit log, settings,
and the trust-and-safety and business modules: reports and decisions, appeals, safety incidents, live sessions,
the moderation policy, business pages, badge requests, advertisers and campaigns. Messaging moderation is **not
built** (there is no messaging), and the live side only records sessions and incidents for a later real live
service.

Tested with Vitest (unit and component) and by hand in a Chromium-based browser against the real API in
development and in a production build. **The trust-and-safety and business pages were not used by hand in a
browser**: they are covered by component tests and, through the console's own server routes, by a script that
signed in a staff account, read every list (the business and advertising lists were empty) and decided a real
report against the real API. There is **no automated end-to-end browser test** and no assistive-technology
audit yet. Screenshots of native `<dialog>` content taken by the development browser
tool are mis-scaled, so dialogs were verified through the page structure, not pixels.
