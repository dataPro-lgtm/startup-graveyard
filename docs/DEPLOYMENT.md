# Production deployment baseline

The repository ships separate immutable images for database migrations, seed data, API/background runtimes, and Web. The production Compose file is a single-host baseline; use an external TLS ingress and secret manager in a public environment.

## Required configuration

Create a deployment environment file outside version control with at least:

```bash
POSTGRES_PASSWORD=<strong-random-password>
DATABASE_URL=postgresql://startup_graveyard:<url-encoded-password>@postgres:5432/startup_graveyard
# Optional transitional credential for non-browser automation only
ADMIN_API_KEY=<strong-random-service-key>
JWT_SECRET=<at-least-48-random-bytes>
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=lax
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
NEXT_PUBLIC_SITE_URL=https://app.example.com
WEB_BASE_URL=https://app.example.com
CORS_ALLOWED_ORIGINS=https://research.example.com
TRUST_PROXY=127.0.0.1,10.0.0.0/8
```

Add Stripe, AI provider, email, CRM, webhook, and Slack variables only for integrations enabled in that environment.

`WEB_BASE_URL` is always included in the exact CORS allowlist. Add other browser origins through comma-separated `CORS_ALLOWED_ORIGINS`; paths and wildcard origins are rejected. Configure `TRUST_PROXY` only with the trusted ingress addresses that may supply client IP headers.

Browser authentication uses Host-only HttpOnly access and refresh cookies. Browser-origin login and refresh responses do not expose bearer credentials in JSON. Keep `AUTH_COOKIE_SECURE=true` on every public deployment. Use `SameSite=lax` when Web and API are same-site subdomains; cross-site deployments require `SameSite=none`, Secure cookies, and an explicit CORS origin. Bearer authentication remains available for non-browser API clients.

Migration `0034_device_sessions.sql` intentionally invalidates existing sessions once, because legacy refresh tokens were stored in plaintext. After deployment, users must sign in again. New refresh credentials are persisted only as SHA-256 digests; accounts can keep up to 10 devices and selectively revoke them from the account security panel.

Migration `0035_admin_rbac.sql` promotes existing `role='admin'` users to `owner`, adds Viewer/Editor/Operator/Owner separation, and stores actor identity on admin audit events. Before removing any external Basic perimeter, register and promote at least two named owners, verify `/admin/login`, then assign lower roles by least privilege:

```sql
UPDATE users
SET role = 'admin', admin_role = 'owner', updated_at = NOW()
WHERE email IN ('owner-one@example.com', 'owner-two@example.com');
```

Migration `0036_stripe_webhook_events.sql` adds the Stripe event ledger and source-event uniqueness for billing funnel side effects. Processed duplicates receive HTTP 200, concurrent leases receive HTTP 409 for retry, and failed processing receives HTTP 500 after the failure is persisted. Monitor `platform.stripeWebhooks` and the `stripe_webhook_failures` platform alert after rollout.

Migration `0037_runtime_process_heartbeats.sql` records worker and scheduler instance health. It is additive and may be retained during rollback. Admin diagnostics use the newest durable heartbeat rather than API process memory.

High-risk API routes are rate-limited by default in production. Defaults use a 60-second window with separate budgets for auth (10), token refresh (30), Copilot (20), report export (10), billing mutations (10), and Stripe webhooks (120). Override the corresponding `RATE_LIMIT_*` variables only after load testing; production startup rejects `RATE_LIMIT_ENABLED=false`.

## Build and start

```bash
docker compose --env-file /secure/path/startup-graveyard.env \
  -f compose.production.yml build

docker compose --env-file /secure/path/startup-graveyard.env \
  -f compose.production.yml up -d
```

The production topology runs four long-lived services:

- `api`: HTTP-only Fastify process on port `18080`; it does not start background timers.
- `worker`: consumes queued ingestion jobs and exposes internal readiness on port `18081`.
- `scheduler`: claims due schedules and exposes internal readiness on port `18082`.
- `web`: Next.js application that depends only on API readiness.

API, worker, and scheduler use the same immutable API image digest with different commands. Set `IMAGE_TAG` to the promoted release tag; do not build role-specific application images.

Startup ordering is enforced as:

`PostgreSQL healthy -> migrations complete -> API / worker / scheduler`, then `API ready -> Web`

Worker and scheduler are intentionally not API startup dependencies. Their failure raises Admin alerts without taking the public API offline.

The production database is intentionally not seeded during normal startup. For a disposable demo or acceptance environment only, apply the versioned sample dataset once with:

```bash
docker compose --env-file /secure/path/startup-graveyard.env \
  -f compose.production.yml --profile demo run --rm seed
```

The seed runner records every applied file in `schema_seeds`, so rerunning the command is safe. Do not use the sample dataset as a substitute for a governed production content pipeline.

## Verify

```bash
curl --fail https://api.example.com/health/ready
curl --fail https://app.example.com/

docker compose --env-file /secure/path/startup-graveyard.env \
  -f compose.production.yml exec worker node -e \
  "fetch('http://127.0.0.1:18081/health/ready').then(async r=>{console.log(r.status,await r.text());if(!r.ok)process.exit(1)})"

docker compose --env-file /secure/path/startup-graveyard.env \
  -f compose.production.yml exec scheduler node -e \
  "fetch('http://127.0.0.1:18082/health/ready').then(async r=>{console.log(r.status,await r.text());if(!r.ok)process.exit(1)})"
```

The API refuses to start in production without PostgreSQL, a non-default JWT secret, an exact `WEB_BASE_URL`, and enabled request throttling. Database migrations are append-only and execute before the API starts. `ADMIN_API_KEY` is optional; omit it after every automated caller has moved to a governed workload identity.

The Admin Dashboard must show `runtime_heartbeat` for worker and scheduler, fresh heartbeat timestamps, and no inactive/stalled runtime alert.

## Scale and recover background runtimes

Worker claims use PostgreSQL row locking, so replicas can be scaled independently:

```bash
docker compose --env-file /secure/path/startup-graveyard.env \
  -f compose.production.yml up -d --scale worker=2
```

Keep one scheduler replica by default. Multiple schedulers remain claim-safe through `FOR UPDATE SKIP LOCKED`, but provide little benefit at the current cadence.

If a worker terminates during a job, restart it and use the Admin stale-running recovery action after the configured threshold. Do not edit `ingestion_jobs` manually. Runtime heartbeat rows are operational history and can remain after process exit.

For Stage D rollback, roll back API/Web/worker/scheduler images together and keep migration `0037`; older images ignore the additive table. Never drop the heartbeat table during incident rollback.

## Operate safely

- Terminate TLS and apply a second layer of request limits at the ingress. API limits are process-local, so multi-replica deployments must use a shared edge/Redis limiter to enforce a global budget.
- Keep `/admin/*` behind TLS and preferably an ingress allowlist or identity-aware proxy in addition to application RBAC.
- Review named admin roles and the actor-attributed audit stream regularly; demotion and session revocation take effect on the next request.
- Do not store browser access or refresh tokens in Web Storage. Cookie-authenticated mutations are rejected unless their `Origin` is explicitly allowed.
- Review active devices after credential or staff changes. Selective revocation invalidates both access and refresh use immediately; security events are written to the audit stream.
- Keep PostgreSQL private; `compose.production.yml` does not publish its port.
- Back up the PostgreSQL volume before applying new migrations.
- Build one image revision and promote the same digest between environments.
- Install Playwright Chromium once locally with `pnpm exec playwright install chromium`, then run `make ci-full` before promotion. CI installs the browser and builds every production image automatically.
- Treat this Compose topology as a single-host baseline. Multi-node deployments should move PostgreSQL to a managed service and run API/Web/worker/scheduler as separate workloads.
