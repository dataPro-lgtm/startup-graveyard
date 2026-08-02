# Production deployment baseline

The repository ships separate immutable images for database migrations, API, and Web. The production Compose file is a single-host baseline; use an external TLS ingress and secret manager in a public environment.

## Required configuration

Create a deployment environment file outside version control with at least:

```bash
POSTGRES_PASSWORD=<strong-random-password>
DATABASE_URL=postgresql://startup_graveyard:<url-encoded-password>@postgres:5432/startup_graveyard
ADMIN_API_KEY=<strong-random-admin-key>
JWT_SECRET=<at-least-48-random-bytes>
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
NEXT_PUBLIC_SITE_URL=https://app.example.com
WEB_BASE_URL=https://app.example.com
```

Add Stripe, AI provider, email, CRM, webhook, and Slack variables only for integrations enabled in that environment.

## Build and start

```bash
docker compose --env-file /secure/path/startup-graveyard.env \
  -f compose.production.yml build

docker compose --env-file /secure/path/startup-graveyard.env \
  -f compose.production.yml up -d
```

Startup ordering is enforced as:

`PostgreSQL healthy -> migrations complete -> API ready -> Web`

## Verify

```bash
curl --fail https://api.example.com/health/ready
curl --fail https://app.example.com/
```

The API refuses to start in production without PostgreSQL, an admin key, and a non-default JWT secret. Database migrations are append-only and execute before the API starts.

## Operate safely

- Terminate TLS and apply request limits at the ingress.
- Keep PostgreSQL private; `compose.production.yml` does not publish its port.
- Back up the PostgreSQL volume before applying new migrations.
- Build one image revision and promote the same digest between environments.
- Run `make ci-full` before promotion. CI also builds every production image.
- Treat this Compose topology as a single-host baseline. Multi-node deployments should move PostgreSQL to a managed service and run API/Web/worker as separate workloads.
