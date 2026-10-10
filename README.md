# BLOCKS

An India-first social platform built around the **Reach Ladder**: District → State →
National → Global.

This repository holds three independently installable applications and their design
and engineering documents.

```
BLOCKS/
  UI/              design references (HTML prototypes of the admin console and the app)
  frontend/        Flutter mobile app (Android / iOS)
  backend/         NestJS API, Prisma + PostgreSQL, Redis, workers
  admin-frontend/  Next.js staff console (BFF, httpOnly cookies, nonce CSP)
  docs/            architecture, database, API, security, deployment
```

## Where things stand

The Flutter app runs two ways: as a finished, test-covered **demo** on mock repositories, and
**live** against the backend, where the core social and account flows are connected and the rest
answer "not available" (never demo data). The backend and the admin console are built (twelve
stages); the status of every stage, and what is verified versus mocked, is in
[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md). Nothing is described as
complete there until its code, its integration and a test that actually ran exist.

## Prerequisites

| Tool | Version used | For |
|---|---|---|
| Node.js | 24 (22 LTS or newer) | backend, admin console |
| npm | 12 | install scripts are blocked by default; see `docs/IMPLEMENTATION_PLAN.md` |
| Flutter | 3.47 (Dart 3.13) | mobile app |
| PostgreSQL | 16 or newer | database (development uses an npm-provided PostgreSQL 18, no install needed) |
| Redis | 7 | cache, rate limiting, queues (optional in development) |

## Quick start

Mobile app (mock data, no server needed):

```bash
cd frontend
flutter pub get
flutter run --dart-define=APP_ENV=demo
flutter analyze && flutter test
```

Mobile app against a local backend (start it first, see `backend/README.md`; accounts and posts are
real rows in the development database):

```bash
cd frontend
flutter run --dart-define=APP_ENV=staging --dart-define=DEMO_MODE=false \
  --dart-define=API_BASE_URL=http://10.0.2.2:4000   # Android emulator; use http://localhost:4000 elsewhere
# the same screens and repositories, tested against the running API:
BLOCKS_LIVE_API=http://127.0.0.1:4000 flutter test test/live
```

Backend and staff console: see `backend/README.md` and `admin-frontend/README.md`. Each package
installs and runs on its own.

## Documents

* [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md): audit, stages and status
* [`docs/architecture.md`](docs/architecture.md): system design and decisions
* [`docs/database-schema.md`](docs/database-schema.md): every table, generated from the schema files
* [`docs/api-documentation.md`](docs/api-documentation.md): every route, generated from the running application
  ([`docs/openapi.json`](docs/openapi.json) is the machine-readable form)
* [`docs/security.md`](docs/security.md): the security model, what is enforced and the open risks
* [`docs/deployment.md`](docs/deployment.md): configuration, release, monitoring, backup and recovery
* [`frontend/docs/`](frontend/docs): the Flutter app's own design, security and migration notes

## Secrets

No secret is ever committed. Every package ships a `.env.example` containing
placeholders only; real values live in a secrets manager or an untracked `.env`.
