# Stage C production security closeout

Stage C replaces interim shared credentials and best-effort webhook handling with named access control, attributable operations, and replay-safe billing events. Work is delivered as one milestone so database, API, Web, tests, and operating guidance move together.

## C3.1 Named admin identity and RBAC

- Reuse `users` and revocable device sessions as the identity source.
- Assign one of `viewer`, `editor`, `operator`, or `owner` to admin users.
- Authorize each admin route by capability instead of treating every administrator as a superuser.
- Keep `ADMIN_API_KEY` only as a transitional service principal for non-browser automation.
- Attach actor identity, role, authentication type, request id, route, and outcome to admin mutation audit events.

Exit criteria:

- A non-admin or revoked session cannot access an admin route.
- A viewer cannot mutate data; an editor cannot run operations; an operator cannot edit content; an owner can do both.
- PostgreSQL integration tests prove role boundaries and actor attribution against real constraints.

## C3.2 Independent Admin Web session

- Replace the HTTP Basic perimeter and browser use of the shared API key with a dedicated admin login.
- Store admin access and refresh credentials in Host-only `HttpOnly`, `Secure`, `SameSite` cookies.
- Refresh rotated credentials server-side and reject users whose current database role no longer grants admin access.
- Provide explicit logout and preserve the existing device-revocation semantics.

Exit criteria:

- No Admin Web request sends `ADMIN_API_KEY`.
- Browser tests cover login, denied role, authorized read/write, refresh, logout, and revoked session behavior.
- Production configuration no longer requires `ADMIN_UI_USERNAME` or `ADMIN_UI_PASSWORD`.

## C3.3 Stripe webhook event ledger

- Claim every verified Stripe event id atomically before applying billing state.
- Persist processing, processed, and failed states with attempt count, lease, and bounded error detail.
- Acknowledge processed duplicates without repeating business side effects.
- Return a retryable error after recording failures; allow failed or stale claims to be reclaimed safely.

Exit criteria:

- Duplicate delivery produces one business transition.
- A failed first attempt can be replayed to completion.
- Concurrent PostgreSQL claims have a single winner.
- Subscription create, update, past-due, recovery, cancellation, and deletion transitions are covered.

## C3.4 Release and rollback gate

- Update OpenAPI, environment examples, deployment guidance, migration order, and operator runbooks.
- Run static checks, unit/integration tests, PostgreSQL tests, production builds, and browser flows.
- Document the admin bootstrap procedure and migration rollback constraints.

Milestone acceptance:

- `make ci`, `make test-pg`, and `make test-e2e` pass.
- Production images build and readiness checks pass locally.
- No secrets or browser credentials are committed.
- Only after all gates pass: commit once for the milestone, push the branch, mark the existing PR ready, merge to `main`, and verify remote `main`.

## Rollout order

1. Back up PostgreSQL and apply additive migrations.
2. Bootstrap at least two named owners and verify their admin login before removing the Basic perimeter.
3. Deploy API, then Web, then enable Stripe delivery against the new webhook endpoint.
4. Monitor admin authorization failures, webhook failed/reclaimed counts, and billing reconciliation drift.

Rollback uses the previous API/Web images while retaining additive tables and columns. Do not roll back database migrations destructively; the previous application revision ignores the new schema. Keep the transitional service key until all scheduled callers use a named workload identity in a later milestone.
