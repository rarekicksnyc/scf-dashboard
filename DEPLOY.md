# Deployment

How to run the SCF Discounting Control Tower somewhere other than a laptop so it
can be reached from any device. Written to be scannable for IT.

## What it is

- A single Next.js (Node) web app. No separate backend.
- State is held in memory for fast, synchronous reads. With `DATABASE_URL` set it
  is loaded from Postgres on boot and auto-saved back when it changes, so edits
  survive restarts and redeploys (see [lib/data/persistence.ts](lib/data/persistence.ts)).
  Without `DATABASE_URL` the app runs purely in memory (local dev).
- Run as a **single instance**. The in-memory cache is per-process, so two
  instances would not share live state. One always-on instance + Postgres is the
  intended setup; horizontal scaling would need the full relational migration.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Yes (in any deployed env) | Secret used to sign per-user login sessions. Set a long random value. Without it, a dev-only fallback is used (fine locally, not for deployment). |
| `DATABASE_URL` | For durable data | Postgres connection string (`postgres://user:pass@host:5432/db?sslmode=require`). When set, state is loaded on boot and auto-saved. The app creates its one table (`app_state`) automatically on first start. |
| `DEMO_PASSWORD` | No | Password every seeded demo user logs in with (default `demo1234`). Applies only on first seed. Replace with real passwords / SSO for production. |
| `APP_PASSWORD` | No | Optional extra shared HTTP Basic gate in front of the whole site (on top of per-user login). Leave unset to rely on login alone. |
| `PORT` | No | Port to listen on (default 3000). Most hosts set this automatically. |

## Option A — Managed host (simplest)

Any Node host (Render, Railway, Fly, an internal PaaS) with these settings:

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Environment: set `APP_PASSWORD` to a strong password.

The host gives a permanent HTTPS URL. Open it, enter any username and the
password, and the app loads. Redeploy on each new commit.

## Option B — Docker / on-prem (container platforms)

A standard two-stage [Dockerfile](Dockerfile) is included (builds the Next.js
standalone server on `node:20-slim`).

```bash
docker build -t scf-dashboard .
docker run -p 3000:3000 \
  -e APP_PASSWORD='choose-a-strong-password' \
  -e DATABASE_URL='postgres://user:pass@host:5432/db' \
  scf-dashboard
```

Then reverse-proxy it behind TLS (nginx / the platform's ingress) and restrict
network access per bank policy.

## Security before exposing publicly

- **Per-user login** gates the whole app: every user signs in with a password and
  gets an HMAC-signed session cookie (see [middleware.ts](middleware.ts),
  [lib/session.ts](lib/session.ts)). Set a strong `SESSION_SECRET`.
- For a real bank rollout, replace the shared `DEMO_PASSWORD` with per-user
  passwords or wire SSO (SAML/OIDC) — the login route is the seam.
- `APP_PASSWORD` is an optional extra shared gate on top of login.
- Always serve over HTTPS (managed hosts do this automatically).
- Prefer restricting to the corporate network / VPN for anything beyond a demo.

## Local development

`npm install && npm run dev` — `APP_PASSWORD` is unset, so no password prompt.
