# Startup Graveyard — Developer Commands
# Usage: make <target>
.PHONY: help dev build test test-pg typecheck lint format db-up db-down db-migrate db-seed db-reset embed clean

SHELL := /bin/bash

# ── Colors ────────────────────────────────────────────────────────────────────
BOLD  := \033[1m
RESET := \033[0m
GREEN := \033[32m
CYAN  := \033[36m

help: ## Show this help
	@echo ""
	@echo "$(BOLD)Startup Graveyard$(RESET) — available commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""

# ── Dev ───────────────────────────────────────────────────────────────────────
dev: ## Start API + Web in dev mode
	pnpm dev

dev-api: ## Start API only
	pnpm --filter @sg/api dev

dev-web: ## Start Web only
	pnpm --filter @sg/web dev

# ── Build / CI ────────────────────────────────────────────────────────────────
build: ## Build all packages
	pnpm build

test: ## Run all tests
	pnpm test

test-pg: ## Run API PostgreSQL integration tests
	pnpm --filter @sg/api test:pg

typecheck: ## TypeScript type check all packages
	pnpm typecheck

lint: ## ESLint + turbo lint
	pnpm lint

lint-fix: ## Auto-fix ESLint errors
	pnpm lint:fix

format: ## Prettier write
	pnpm format

format-check: ## Prettier check (CI mode)
	pnpm format:check

ci: format-check lint typecheck test build ## Full CI pipeline (local)

# ── Database ──────────────────────────────────────────────────────────────────
db-up: ## Start Postgres via docker-compose
	docker compose up -d postgres
	@echo "$(GREEN)Postgres ready on port 5433$(RESET)"

db-down: ## Stop Postgres
	docker compose down

db-migrate: ## Run all pending migrations
	docker compose --profile migrate run --rm migrate

db-seed: ## Apply pending seed files
	docker compose --profile seed run --rm seed

db-reset: db-down ## Wipe + recreate DB, then migrate + seed
	docker compose down -v
	$(MAKE) db-up
	sleep 3
	$(MAKE) db-migrate
	$(MAKE) db-seed

# ── Embeddings ────────────────────────────────────────────────────────────────
embed: ## Generate vector embeddings for published cases
	cd services/api && node scripts/gen_embeddings.mjs

# ── Cleanup ───────────────────────────────────────────────────────────────────
clean: ## Remove all build artifacts and node_modules
	find . -name '.next' -type d -prune -exec rm -rf {} \; 2>/dev/null || true
	find . -name 'dist'  -type d -prune -exec rm -rf {} \; 2>/dev/null || true
	find . -name 'node_modules' -type d -prune -exec rm -rf {} \; 2>/dev/null || true
	find . -name '.turbo' -type d -prune -exec rm -rf {} \; 2>/dev/null || true
	@echo "$(GREEN)Clean complete$(RESET)"
