# Production deployment baseline

The repository ships separate immutable images for database migrations, API, and Web. The production Compose file is a single-host baseline; use an external TLS ingress and secret manager in a public environment.

## Required configuration

Create a deployment environment file outside version control with at least:

```bash
POSTGRES_PASSWORD=<strong-random-password>
DATABASE_URL=postgresql://startup_graveyard:<url-encoded-password>@postgres:5432/startup_graveyard
ADMIN_API_KEY=<strong-random-admin-key>
ADMIN_UI_USERNAME=<non-public-admin-username>
ADMIN_UI_PASSWORD=<strong-random-admin-password>
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

High-risk API routes are rate-limited by default in production. Defaults use a 60-second window with separate budgets for auth (10), token refresh (30), Copilot (20), report export (10), billing mutations (10), and Stripe webhooks (120). Override the corresponding `RATE_LIMIT_*` variables only after load testing; production startup rejects `RATE_LIMIT_ENABLED=false`.

## Build and start

```bash
docker compose --env-file /secure/path/startup-graveyard.env \
  -f compose.production.yml build

docker compose --env-file /secure/path/startup-graveyard.env \
  -f compose.production.yml up -d
```

Startup ordering is enforced as:

`PostgreSQL healthy -> migrations complete -> API ready -> Web`

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
```

The API refuses to start in production without PostgreSQL, an admin key, a non-default JWT secret, an exact `WEB_BASE_URL`, and enabled request throttling. Database migrations are append-only and execute before the API starts.

## Operate safely

- Terminate TLS and apply a second layer of request limits at the ingress. API limits are process-local, so multi-replica deployments must use a shared edge/Redis limiter to enforce a global budget.
- Keep `/admin/*` behind the configured Admin UI credentials and an ingress allowlist or identity-aware proxy. HTTP Basic is an interim perimeter; it does not replace application-level admin roles.
- Use different values for `ADMIN_UI_PASSWORD` and `ADMIN_API_KEY`.
- Do not store browser access or refresh tokens in Web Storage. Cookie-authenticated mutations are rejected unless their `Origin` is explicitly allowed.
- Keep PostgreSQL private; `compose.production.yml` does not publish its port.
- Back up the PostgreSQL volume before applying new migrations.
- Build one image revision and promote the same digest between environments.
- Install Playwright Chromium once locally with `pnpm exec playwright install chromium`, then run `make ci-full` before promotion. CI installs the browser and builds every production image automatically.
- Treat this Compose topology as a single-host baseline. Multi-node deployments should move PostgreSQL to a managed service and run API/Web/worker as separate workloads.
