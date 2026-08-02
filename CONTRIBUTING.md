# Contributing

Startup Graveyard accepts focused contributions to product workflows, case quality, evaluation coverage, and platform reliability.

## Before You Start

- Search existing issues before opening a new one.
- Use a security advisory for vulnerabilities; follow [SECURITY.md](./SECURITY.md).
- Keep pull requests scoped to one problem. Separate unrelated cleanup from functional changes.
- For material product changes, describe the user workflow and acceptance evidence before implementation.

## Development Setup

Prerequisites: Node.js 22, pnpm 10, and Docker with Compose.

```bash
corepack enable
pnpm install
cp .env.example .env
make db-reset
make dev
```

## Branches and Commits

Create a short-lived branch from the latest `main`:

```bash
git switch main
git pull --ff-only
git switch -c feature/short-description
```

Use `feature/`, `fix/`, `refactor/`, `docs/`, `test/`, or `infra/` as the branch prefix. All changes target `main` through a pull request.

Commit messages follow Conventional Commits:

```text
feat(copilot): add citation confidence to answers
fix(cases): preserve filters when changing pages
docs: clarify production seed behavior
```

## Quality Gates

Run the fast gate during development:

```bash
make ci
```

Run the complete release gate for changes that affect migrations, PostgreSQL behavior, browser workflows, containers, or observability:

```bash
pnpm exec playwright install chromium
make ci-full
```

New behavior should include tests at the lowest useful layer. Permission boundaries, database constraints, and user journeys require PostgreSQL or browser coverage; mock tests alone are not sufficient evidence.

## Pull Requests

Every pull request should state:

- The problem and user impact
- The chosen approach and important tradeoffs
- Commands run and observed results
- Migration, security, rollout, or rollback considerations

Do not commit secrets, generated test reports, local environment files, or demo data that cannot be redistributed.
