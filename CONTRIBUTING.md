# Contributing Guide

## Branch Strategy

```
main        ← production (protected, merge via PR only)
  └─ develop     ← integration branch (protected)
       ├─ feature/<name>   new features
       ├─ fix/<name>       bug fixes
       ├─ refactor/<name>  code improvements
       └─ db/<name>        migrations / seeds
```

**Workflow:**

```bash
# 1. Branch from develop
git checkout develop && git pull
git checkout -b feature/my-feature

# 2. Work in small commits
git add <files>
git commit -m "feat(scope): description"

# 3. Keep up to date
git fetch origin
git rebase origin/develop

# 4. Push and open PR → develop
git push -u origin feature/my-feature

# 5. After review: Squash merge into develop
# 6. develop → main: PR for releases
```

## Commit Convention

Format: `type(scope): subject`

| type       | when                    |
| ---------- | ----------------------- |
| `feat`     | new feature             |
| `fix`      | bug fix                 |
| `refactor` | neither feature nor fix |
| `perf`     | performance             |
| `test`     | tests                   |
| `docs`     | documentation           |
| `build`    | deps / build system     |
| `ci`       | CI/CD config            |
| `db`       | migrations / seeds      |
| `infra`    | DevOps / infrastructure |
| `chore`    | misc                    |
| `revert`   | rollback                |

Examples:

```
feat(copilot): stream answer tokens via SSE
fix(cases): include key_lessons in getById SELECT
db(users): add sessions table migration
ci: split lint + typecheck + test + build jobs
```

## Local Setup

```bash
# Prerequisites: Node 22, pnpm 10, Docker
make db-up        # start Postgres
make db-migrate   # run migrations
make db-seed      # seed data
make dev          # start API + Web

# Full CI check
make ci
```

## PR Checklist

- [ ] `make ci` passes locally
- [ ] New tests for new behaviour
- [ ] No `console.log` left in production code
- [ ] DB migrations are backwards-compatible
