# Deployment

How to run the SCF Discounting Control Tower somewhere other than a laptop so it
can be reached from any device. Written to be scannable for IT.

## What it is

- A single Next.js (Node) web app. No separate backend.
- Data today lives in memory in the running server process (see the note in
  [SECURITY.md](SECURITY.md)). A single always-on instance keeps edits until the
  next restart/redeploy. Durable storage (Postgres) is the planned Phase 2.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `APP_PASSWORD` | Yes (in any deployed env) | Shared site password. When set, the whole site is behind an HTTP Basic password prompt (see [middleware.ts](middleware.ts)). Leave unset only for local dev. |
| `PORT` | No | Port to listen on (default 3000). Most hosts set this automatically. |
| `DATABASE_URL` | Phase 2 | Postgres connection string, once durable storage is wired. |

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
docker run -p 3000:3000 -e APP_PASSWORD='choose-a-strong-password' scf-dashboard
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
