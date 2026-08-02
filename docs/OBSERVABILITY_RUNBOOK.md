# Production observability runbook

## Runtime topology

| Runtime   | Service name                  | Metrics endpoint         |
| --------- | ----------------------------- | ------------------------ |
| API       | `startup-graveyard-api`       | `api:9464/metrics`       |
| Worker    | `startup-graveyard-worker`    | `worker:9465/metrics`    |
| Scheduler | `startup-graveyard-scheduler` | `scheduler:9466/metrics` |

The application ports are internal Compose endpoints. Prometheus scrapes them through the service network; do not publish them through the public ingress.

## Configure

```bash
OBSERVABILITY_ENABLED=true
RELEASE_VERSION=<immutable-image-tag>
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318

PLATFORM_ALERT_COOLDOWN_MINUTES=60
PLATFORM_ALERT_RETRY_MINUTES=5
PLATFORM_ALERT_TIMEOUT_MS=10000
PLATFORM_ALERT_WEBHOOK_URL=https://alerts.example.com/v1/events
PLATFORM_ALERT_WEBHOOK_BEARER_TOKEN=<secret>
PLATFORM_ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/<secret>
```

`OTEL_EXPORTER_OTLP_ENDPOINT` is the collector base URL; the runtime appends `/v1/traces`. Use `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` when the full trace endpoint must be specified. Configure at least one platform alert channel in production. Secrets belong in the deployment secret manager, not `.env` committed to Git.

## Start and verify

```bash
make observability-check

docker compose --env-file /secure/path/startup-graveyard.env \
  -f compose.production.yml --profile observability up -d

curl --fail http://127.0.0.1:${PROMETHEUS_PORT:-9090}/-/ready
curl --fail 'http://127.0.0.1:9090/api/v1/targets?state=active'
```

All three Startup Graveyard targets must report `health: up`. Verify each endpoint from inside its container when one target is down:

```bash
docker compose -f compose.production.yml exec api \
  node -e "fetch('http://127.0.0.1:9464/metrics').then(async r=>{console.log(r.status,(await r.text()).slice(0,500));if(!r.ok)process.exit(1)})"
```

Repeat with worker port `9465` and scheduler port `9466`.

## Alert delivery semantics

- Only `warning` and `critical` platform diagnostics are delivered.
- State is keyed by `(alert_code, channel)` in `platform_alert_delivery_states`.
- A repeated alert is suppressed until cooldown expiry; a warning-to-critical escalation bypasses cooldown.
- Failed firing and recovery deliveries become eligible after the retry interval.
- Recovery is delivered once after success. Concurrent processes claim through row locks and `SKIP LOCKED`.
- The webhook receives `x-sg-idempotency-key`; downstream receivers must also deduplicate by that key.
- Delivery/control-plane failure is logged and audited without discarding the captured platform snapshot.

Inspect delivery state:

```sql
SELECT alert_code, channel, severity, status,
       last_attempt_at, last_delivered_at, next_attempt_at,
       resolution_delivery_pending, delivery_count, suppressed_count, last_error
FROM platform_alert_delivery_states
ORDER BY COALESCE(next_attempt_at, last_attempt_at) DESC NULLS LAST;
```

Do not edit rows to silence an alert. Fix the underlying condition or temporarily remove the affected channel configuration through the controlled deployment process.

## Incident triage

1. Confirm public/API readiness and identify which Prometheus target is down.
2. Check `sg_runtime_heartbeat_writes_total`, `sg_scheduler_ticks_total`, `sg_ingestion_jobs_total`, and `sg_http_server_requests_total` before reading unbounded logs.
3. Use the response `x-trace-id` to find the request in the configured trace backend.
4. Open Admin Dashboard platform diagnostics for queue age, stale jobs, heartbeat history, snapshot cadence, and regression suppression context.
5. Inspect application logs and the alert state table only after narrowing the failing runtime and time window.
6. Apply the documented stale-job reclaim or restart only the unhealthy runtime; worker/scheduler failure must not require API restart.
7. Capture a fresh platform snapshot and verify one recovery notification after the condition clears.

## Release and rollback gates

```bash
make ci-full
pnpm containers:build
```

Rollback API, worker, and scheduler to the same image revision. Keep migrations `0037` and `0038`; both are additive and preserve incident evidence across application rollback.
