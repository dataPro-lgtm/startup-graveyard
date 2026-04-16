# Startup Graveyard

> Open-source failure intelligence for founders, investors, and researchers.

Startup Graveyard turns startup postmortems into structured, queryable, explainable research assets.

中文辅助理解：把创业失败从“故事阅读”升级成“结构化研究资产”。

`Runnable alpha` · `Open source` · `40+ published seed cases`

Visual placeholders and image prompts for the README live under [`docs/assets`](./docs/assets/README.md) and [`docs/IMAGE_PROMPTS.md`](./docs/IMAGE_PROMPTS.md).

## Why this exists

Most startup failure content is still trapped in anecdotal postmortems, scattered news coverage, and founder folklore.

That format is useful for reading, but weak for research. It is hard to compare cases across sectors, markets, business models, and failure modes. It is even harder to ask practical questions like:

- Which failure patterns repeat across adjacent startups?
- What signals usually show up before a shutdown?
- How do marketplace, fintech, or climate startups fail differently?
- What does a founder, investor, or product team need to study before repeating the same path?

Startup Graveyard exists to answer those questions with structure instead of vibes.

## What Startup Graveyard is

Startup Graveyard is an open-source failure intelligence platform.

It combines:

- A structured case library of startup shutdowns and postmortems
- Research workflows for filtering, saving, exporting, and sharing insight slices
- Grounded analysis through Failure Copilot
- Admin workflows for ingestion, review, evidence management, and publication
- Platform primitives for search, indexing, taxonomy normalization, and research operations

This repository is not a slide deck or static mock. It is a runnable alpha product with a working public surface, admin workflows, and an evolving commercial foundation.

## Who it is for

- Founders who want to study failure patterns before they scale into them
- Investors who want structured downside pattern recognition, not isolated anecdotes
- Researchers and analysts who need reusable case intelligence, not one-off reading notes
- Product, strategy, and operating teams building internal research workflows around startup failure

## What you can do with it

- Explore a structured case dataset with filters across industry, country, business model, closure year, and primary failure reason
- Open the Research Hub to start from reusable research questions instead of random browsing
- Ask Failure Copilot grounded questions across the archive
- Save case filters as reusable research views
- Export Markdown and PDF research briefs
- Publish shareable public brief links
- Collaborate through Team Workspaces, shared saved views, and shared cases
- Run admin review and ingestion flows from source snapshot to published case

## How it works

![Startup Graveyard case lifecycle](./docs/assets/readme-case-lifecycle.png)

The product already supports a real content production loop:

1. Capture or draft a case.
2. Attach evidence and snapshots.
3. Extract and normalize structured signals.
4. Review and publish.
5. Index for search, similarity, Copilot, and research outputs.

## Product architecture

The current architecture is organized around three layers.

### Public research surface

- Homepage and case explorer
- Research Hub
- Case detail pages
- Failure Copilot
- Saved views, report export, and public brief shares

### Admin and operations surface

- Draft and review workflow
- Evidence and source snapshot management
- Ingestion handlers and scheduler triggers
- Team billing recovery, outreach, and recovery playbooks
- Ops dashboard for research, billing, and recovery workflows

### Platform and data layer

- PostgreSQL with `pgvector`, `pg_trgm`, and `citext`
- Shared schema and OpenAPI contract layer
- Search index and embedding pipelines
- Taxonomy normalization and backfill jobs
- Eval, telemetry, and commercial operations primitives

## Why it is different

Startup Graveyard is not trying to be a content farm, a meme archive, or a collection of startup horror stories.

Its differentiation is structural:

- The unit of value is a reusable research asset, not a pageview
- Cases are normalized into comparable entities, factors, timelines, and lessons
- Copilot is grounded in the case archive instead of free-form speculation
- Outputs are shareable and operational: saved views, briefs, PDF exports, and team workflows
- The repo includes both the public product and the operational machinery behind it

## Current status

This project is best described as a runnable alpha.

What is true today:

- The repository contains a working public product, admin surface, and platform workflows
- The seed dataset includes 40+ published cases
- Saved views, briefs, PDF exports, Team Workspaces, billing foundations, and recovery operations already exist
- The system includes structured ingestion, indexing, eval, and operational instrumentation

What is not true today:

- This is not yet a polished production SaaS
- The dataset is not yet at large-scale coverage
- Some commercial and operational flows are still maturing behind the scenes

Detailed maturity tracking lives in [`docs/PRODUCT_MATURITY_PLAN.md`](./docs/PRODUCT_MATURITY_PLAN.md).

## Quickstart

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop

### Install dependencies

```bash
pnpm install
```

### Configure environment variables

```bash
cp .env.example .env
```

Recommended minimum local setup:

```bash
NODE_ENV=development
PORT=18080
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/sg
WEB_BASE_URL=http://127.0.0.1:3000
API_BASE_URL=http://127.0.0.1:18080
ADMIN_API_KEY=dev-admin-key
JWT_SECRET=change-me-in-production
```

Optional integrations:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `STRIPE_*`
- recovery outreach / CRM / webhook / Slack env vars from `.env.example`

### Start and initialize the database

Create a clean local database:

```bash
make db-reset
```

Or run the pieces separately:

```bash
make db-up
make db-migrate
make db-seed
```

### Run the product

```bash
make dev
```

Useful variants:

```bash
make dev-api
make dev-web
pnpm build
pnpm --filter @sg/api start
pnpm --filter @sg/web start
```

## Local URLs

- Web home: `http://127.0.0.1:3000/`
- Research Hub: `http://127.0.0.1:3000/research`
- Failure Copilot: `http://127.0.0.1:3000/copilot`
- Account: `http://127.0.0.1:3000/auth/account`
- Ops dashboard: `http://127.0.0.1:3000/admin/dashboard`
- Review queue: `http://127.0.0.1:3000/admin/reviews`
- Cases admin: `http://127.0.0.1:3000/admin/cases`
- API docs: `http://127.0.0.1:18080/docs`
- Health: `http://127.0.0.1:18080/health`

## Tech stack

### Web

- Next.js 16 App Router
- React 19
- TypeScript

### API

- Fastify 5
- Zod
- TypeScript

### Data and contracts

- PostgreSQL 16
- `pgvector`
- `pg_trgm`
- `citext`
- shared schema package
- OpenAPI contract package

### AI and research primitives

- OpenAI / Anthropic providers
- vector indexing
- eval datasets and replayable regression runs
- prompt telemetry and cost tracking

## Testing strategy

The test strategy is layered.

- Fast feedback through mock-repository API tests
- PostgreSQL integration coverage for the main data and workflow paths
- Contract and type safety through shared schemas and OpenAPI alignment
- Build validation across API and web apps

Common commands:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @sg/api test
pnpm --filter @sg/api test:pg
pnpm build
```

## Product maturity roadmap

The current roadmap is staged around four layers:

- `M1`: trusted data foundation
- `M2`: research product loop
- `M3`: commercial product loop
- `M4`: platform hardening and operational maturity

See the detailed plan in [`docs/PRODUCT_MATURITY_PLAN.md`](./docs/PRODUCT_MATURITY_PLAN.md).

## Repository highlights

- [`apps/web/app/page.tsx`](./apps/web/app/page.tsx): homepage and research entry
- [`apps/web/app/research/page.tsx`](./apps/web/app/research/page.tsx): Research Hub
- [`apps/web/app/copilot/page.tsx`](./apps/web/app/copilot/page.tsx): Failure Copilot workbench
- [`apps/web/app/components/SavedViewsManager.tsx`](./apps/web/app/components/SavedViewsManager.tsx): reusable research asset workflows
- [`services/api/src/ingestion/`](./services/api/src/ingestion): snapshots, extraction, indexing, scheduler handlers
- [`services/api/src/recoveryOutreach/`](./services/api/src/recoveryOutreach): recovery operations channels and playbooks
- [`services/api/src/repositories/`](./services/api/src/repositories): mock and PostgreSQL implementations
- [`packages/contracts/openapi/startup-graveyard.v1.yaml`](./packages/contracts/openapi/startup-graveyard.v1.yaml): API contract

## Contributing

Contributions are welcome, especially in these areas:

- New structured cases and evidence
- Taxonomy, normalization, and labeling quality
- Research workflows and insight UX
- Copilot quality, eval coverage, and prompt iteration
- Platform reliability and local developer experience

Before changing outward-facing copy, read:

- [`docs/README_NARRATIVE_GUIDE.md`](./docs/README_NARRATIVE_GUIDE.md)
- [`docs/WEBSITE_MESSAGING_GUIDE.md`](./docs/WEBSITE_MESSAGING_GUIDE.md)
- [`docs/IMAGE_PROMPTS.md`](./docs/IMAGE_PROMPTS.md)

## Limitations

- The dataset is still intentionally small and seed-stage
- The product is still alpha, even though many flows are already runnable
- Some internal ops and commercial workflows are more mature than the outward product surface
- The current public positioning should stay disciplined: open-source, research-oriented, and credible
