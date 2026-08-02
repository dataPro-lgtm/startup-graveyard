# Stage D: Runtime Isolation and Operational Health

Stage D removes background execution from the HTTP API lifecycle. It establishes independently deployable API, worker, and scheduler processes with database-backed health state so operational decisions are based on shared runtime facts rather than one process's memory.

## Outcomes

- API availability is not coupled to ingestion or scheduled job failures.
- Worker and scheduler processes can be restarted and scaled independently.
- Admin diagnostics report cross-process heartbeat, status, throughput, and errors.
- Production orchestration has explicit readiness checks and dependency ordering.
- Release gates exercise the same isolated process model used in production.

## Delivery Phases

### D1. Process boundaries

- Keep `index.ts` as the HTTP-only API entrypoint.
- Add dedicated worker and scheduler entrypoints with explicit runtime roles.
- Share startup validation, logging, graceful shutdown, and process health behavior.
- Require PostgreSQL for non-API runtime roles.

### D2. Durable runtime health

- Add an additive runtime heartbeat table keyed by component and instance.
- Persist worker/scheduler status, heartbeat, recent activity, counters, and last error.
- Resolve Admin health from the newest durable heartbeat with an in-memory fallback for tests.
- Detect inactive, stale, and erroring components without assuming they run inside the API.

### D3. Production orchestration

- Run API, worker, and scheduler as separate production Compose services.
- Give each service a role-specific health endpoint and Docker healthcheck.
- Keep migrations as a hard dependency and make restarts non-destructive.
- Document scaling, shutdown, recovery, and rollback procedures.

### D4. Release gates

- Add unit tests for process state and durable heartbeat behavior.
- Add PostgreSQL tests for concurrent instances and latest-heartbeat selection.
- Start the independent worker in the browser release gate.
- Require formatting, migration validation, lint, typecheck, unit, PostgreSQL, browser, build, and production image gates.

## Acceptance Criteria

1. API starts and remains ready without starting worker or scheduler timers.
2. Worker and scheduler reject startup without a database and expose role-specific readiness.
3. A worker heartbeat remains visible to Admin API from a different process.
4. Stale or erroring worker/scheduler state raises an actionable platform alert.
5. Queue processing continues after worker restart without duplicate job claims.
6. Production Compose and browser release gates use isolated process roles.
7. `make ci-full` and production container builds pass before the milestone commit.

## Rollout and Rollback

Deploy migration first, then worker and scheduler, then the API and Web images. Confirm both background heartbeats are fresh before considering the rollout healthy. Rollback uses the previous application images while retaining the additive heartbeat table; no destructive database rollback is required.
