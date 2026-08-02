# Database migrations

Migration files are append-only and run in filename order.

Rules:

- Use `NNNN_snake_case.sql` with a new four-digit ordinal.
- Never rename or edit a migration that may have run in another environment. Add a new migration instead.
- Do not add transaction boundaries. The production runner owns one transaction per migration so schema changes and the `schema_migrations` record commit atomically. Historical standalone `BEGIN`/`COMMIT` lines are stripped at execution time without changing the source files.
- Run `pnpm validate:migrations` before committing.
- Run `pnpm --filter @sg/api test:pg` to apply the full migration set to an isolated PostgreSQL database.

The two `0033` files are a historical naming collision. They remain unchanged because deployed databases track migrations by filename; renaming one could cause it to run again. The validation script allows only this exact pair and rejects new collisions.
