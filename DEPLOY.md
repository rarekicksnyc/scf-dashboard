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
| `APP_PASSWORD` | Yes (in any deployed env) | Shared site password. When set, the whole site is behind an HTTP Basic password prompt (see [middleware.ts](middleware.ts)). Leave unset only for local dev. |
| `PORT` | No | Port to listen on (default 3000). Most hosts set this automatically. |
| `DATABASE_URL` | For durable data | Postgres connection string (`postgres://user:pass@host:5432/db`). When set, state is loaded on boot and auto-saved. The app creates its one table (`app_state`) automatically on first start. |

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

- `APP_PASSWORD` is a single shared gate, not per-user login. It stops the open
  internet from reaching the app; it does not replace SSO. Real per-user auth
  (SAML/OIDC) is Phase 3 — see [SECURITY.md](SECURITY.md).
- Always serve over HTTPS (managed hosts do this automatically).
- Prefer restricting to the corporate network / VPN for anything beyond a demo.

## Local development

`npm install && npm run dev` — `APP_PASSWORD` is unset, so no password prompt.
