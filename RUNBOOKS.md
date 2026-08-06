# Operations Runbooks — SCF Control Tower

Concise, action‑oriented runbooks for the on‑call operator. Assumes Render
(app) + Neon (Postgres). Pre‑production checklist: `PREPRODUCTION_CHECKLIST.md`;
data migration: `MIGRATION_PLAN.md`.

## Environment variables (Render)
| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | prod | Neon connection string. Unset ⇒ pure in‑memory (dev only). |
| `SESSION_SECRET` | **prod (app refuses to boot without it)** | Signs session cookies. Strong, rotated. |
| `APP_PASSWORD` | optional | Extra shared HTTP‑Basic gate in front of everything. |
| `SCF_INGEST_KEY` | if host‑to‑host ingest is used | Mandatory in prod (no default). Strong, rotated. |
| `PERSISTENCE_AUTHORITATIVE` | optional | `1` = per‑row tables authoritative (post‑cutover). Default dual‑source. |

## Health & status
- **Liveness/readiness:** `GET /api/health` (public) → `{ok, persistence:{lastSaveAt,lastError}}`. Alert if `ok:false` or `lastError` non‑null. Point the uptime monitor here.
- **Persistence/migration:** `GET /api/admin/db-status` (Portfolio Manager/Admin) → per‑collection `table` vs `memory` counts, audit chain integrity, divergence, and mode.
- **Audit integrity:** the Audit Log page shows a live "tamper‑evident chain intact / N verified" badge; a red badge means the log was altered — investigate immediately.

## Deploy
1. CI (`.github/workflows/ci.yml`) must be green (typecheck + tests + build).
2. Merge to `main` → Render auto‑deploys. Render sends `SIGTERM`; the app flushes state before exit.
3. After deploy: check `/api/health` = 200 and `/api/admin/db-status` looks sane (no `lastError`, `table === memory`).

## Rollback (bad deploy)
1. Render → the service → **Rollback** to the previous deploy (or redeploy the prior commit).
2. Confirm `/api/health` 200. State is durable in Postgres, so a rollback does not lose committed data (the snapshot/tables persist independently of the app version).

## Restore from backup (data loss / corruption)
1. Neon → **Restore** (point‑in‑time) to just before the incident (requires PITR enabled — checklist §1).
2. If only the app‑level snapshot is suspect: the pre‑cutover **full snapshot is frozen in `app_state.data`** and the live per‑row tables are the source of truth — cross‑check via `/api/admin/db-status`.
3. Bring the app up pointed at the restored DB; verify `/api/admin/db-status` and the audit chain badge.

## "Instance stuck" / high latency
1. Check `/api/health` and Render logs for `[persistence]` errors.
2. Look for a `DIVERGENCE` log line — it means **more than one instance is writing state**, which the single‑instance model does not support. **Scale back to exactly one instance** (Render: min=max=1) until multi‑instance coherence (MIGRATION_PLAN Phase 6) is in place.
3. Restart the service; state reloads from Postgres on boot.

## Snapshot / persistence failure
- Symptom: `[persistence] … flush failed` (structured `captureError` line) or `/api/health` `lastError`.
- The store keeps serving from memory; the risk is loss of mutations since the last successful save (≤3s) if the process then dies.
- Fix the DB connectivity (Neon status, `DATABASE_URL`, connection limits) and confirm the next flush succeeds (`lastSaveAt` advances, `lastError` clears).

## Migration cutover (activate table‑authoritative)
See `MIGRATION_PLAN.md` → "How to activate the cutover". In short: let dual‑source
run so tables populate → verify `table === memory` on `/api/admin/db-status` →
set `PERSISTENCE_AUTHORITATIVE=1` and redeploy → re‑verify. Reversible by unsetting.

## Security incident
1. **Suspected session/credential compromise:** rotate `SESSION_SECRET` (invalidates all sessions → everyone re‑logs in) and force password resets. Rotate `SCF_INGEST_KEY` and `APP_PASSWORD` if in use.
2. **Suspected data tampering:** check the audit‑chain badge / `/api/admin/db-status` `chainIntact`. A break points to the first altered entry.
3. **Preserve evidence:** export the audit log and the Four‑eyes evidence report before remediation.

## Key controls (where to look)
- **Four‑eyes evidence:** Reports → "Four‑eyes evidence report" (every limit / ASR sublimit / booking‑exception approval with requester, approver, reference, reason).
- **Exceptions:** Reports → "Exception approval report".
- **Audit:** Reports → "Audit log export" + the Audit Log page (tamper‑evident).
