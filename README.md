# Startup Graveyard

> 把创业失败案例做成结构化、可检索、可解释的研究型知识库。

Startup Graveyard 不是一个“创业失败故事站”，而是一个面向创业者、投资人、产品经理和研究者的 **failure intelligence platform**。它试图回答的不是“这家公司怎么死的”，而是：

- 我现在的项目，是否正在重演历史上的失败路径？
- 哪些失败信号可以被提早识别？
- 某个赛道、商业模式、区域市场里，最常见的失败模式是什么？

当前仓库已经是一个 **可运行的 alpha 产品**，不是 demo 空壳；但它还没有走到成熟商业产品阶段。现在更准确的定位是：

> 一个已经具备结构化案例库、管理后台、基础 ingestion，以及带 session / prompt telemetry / replayable eval 的 Copilot 能力的 alpha 版 failure research product。

## 当前能力

### Public

- 案例列表、关键词搜索、多维筛选
- 案例详情页：公司概览、时间线、失败因子、证据来源、核心教训、个人 watchlist 入口
- 相似案例推荐
- Failure Copilot：基于案例知识库的 grounded Q&A，支持多会话线程、pinned context、回答反馈、prompt 版本追踪与 run telemetry
- 首页 summary：案例数、总融资蒸发金额、失败模式数
- 首页可直接保存当前筛选为 Saved View，并导出 Markdown research brief
- 账号中心：订阅状态、权益概览、账单入口、已保存 watchlist / saved views、Team Workspace 协作面板

### Admin

- 草稿创建、审核、`changes_requested -> resubmit -> approve/reject` 工作流
- 证据来源管理
- 失败因子、时间线、分析结论录入与修正
- ingestion job 管理、source snapshot 查看、操作审计
- 运营 dashboard（含 Copilot telemetry / prompt regression 视图）

### Data / Platform

- PostgreSQL + `pgvector` + `pg_trgm` + `citext`
- source snapshot 留痕
- `extract_case_signals` 轻量结构化抽取
- `rebuild_case_search_index` / `backfill_case_search_index`
- taxonomy 规范化与历史回填
- Copilot prompt versioning、run-level token/cost telemetry、feedback-based eval summary
- Free / Pro / Team entitlement helper、billing profile、watchlist + saved views + team workspace 数据模型、Stripe portal / lifecycle sync、Markdown report export
- replayable Copilot eval dataset、regression batch、latest failure samples、nightly eval scheduler baseline
- OpenAPI 契约、shared schema、PostgreSQL 集成测试 harness

## 当前数据范围

- 内置 **40+** 个已发布失败案例 seed，覆盖全球与中文创业案例
- 包含案例、失败因子、时间线、标签、核心教训、向量索引等基础数据
- 支持继续通过后台或 ingestion pipeline 扩充案例库

## 典型工作流

```mermaid
flowchart LR
  A["Source URL / Manual Draft"] --> B["Source Snapshot"]
  B --> C["Draft Case + Evidence"]
  C --> D["extract_case_signals"]
  D --> E["Review Workflow"]
  E --> F["Published Case"]
  F --> G["Search Index + Embeddings"]
  G --> H["List / Detail / Similar Cases / Copilot"]
```

这条链路已经在仓库里打通到可运行状态：抓取、留痕、抽取、审核、发布、索引回填都有实现与测试覆盖。

## 技术栈

```text
apps/
  web/          Next.js 16 App Router + React 19
services/
  api/          Fastify 5 + TypeScript + Zod
packages/
  shared/       shared schema + taxonomy
  contracts/    OpenAPI 契约
db/
  migrations/   PostgreSQL 迁移
  seed/         本地 seed 数据
```

核心依赖：

- PostgreSQL 16
- `pgvector`
- `pg_trgm`
- OpenAI / Anthropic（可选，用于 Copilot 与 embeddings）

## 快速开始

### 前置要求

- Node.js 20+
- pnpm 9+
- Docker Desktop

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

本地推荐最小配置：

```bash
NODE_ENV=development
PORT=18080
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/sg
WEB_BASE_URL=http://127.0.0.1:3000
API_BASE_URL=http://127.0.0.1:18080
ADMIN_API_KEY=dev-admin-key
JWT_SECRET=change-me-in-production
```

可选配置：

- `OPENAI_API_KEY`：Copilot / embeddings
- `ANTHROPIC_API_KEY`：Copilot chat provider，优先于 OpenAI
- `OPENAI_CHAT_INPUT_COST_PER_1K` / `OPENAI_CHAT_OUTPUT_COST_PER_1K`：覆盖 OpenAI chat 成本估算单价
- `ANTHROPIC_CHAT_INPUT_COST_PER_1K` / `ANTHROPIC_CHAT_OUTPUT_COST_PER_1K`：覆盖 Anthropic chat 成本估算单价
- `STRIPE_*`：订阅链路验证

### 3. 启动并初始化数据库

首次建议直接用一个干净的本地库：

```bash
make db-reset
```

如果你只想启动数据库但保留已有 volume：

```bash
make db-up
make db-migrate
make db-seed
```

说明：

- `docker-compose.yml` 会在本机暴露 `5433 -> 5432`
- `make db-migrate` 现在只会应用未记录的 migration，适合对已有 volume 做增量升级
- `make db-seed` 会在容器内执行 pending seed，不依赖本机安装 `psql`
- `make db-reset` 会清空 volume，并重新执行全部 migration + seed；当你想重建一个干净库时再使用

### 4. 启动应用

开发模式：

```bash
make dev
```

只启动 API：

```bash
make dev-api
```

只启动 Web：

```bash
make dev-web
```

生产构建方式：

```bash
pnpm build
pnpm --filter @sg/api start
pnpm --filter @sg/web start
```

### 5. 打开本地地址

- 前台首页: `http://127.0.0.1:3000/`
- Copilot: `http://127.0.0.1:3000/copilot`
- 账号中心: `http://127.0.0.1:3000/auth/account`
- 管理后台 dashboard: `http://127.0.0.1:3000/admin/dashboard`
- 管理后台 reviews: `http://127.0.0.1:3000/admin/reviews`
- 管理后台 cases: `http://127.0.0.1:3000/admin/cases`
- API docs: `http://127.0.0.1:18080/docs`
- Health: `http://127.0.0.1:18080/health`

注意：

- `/admin` 本身不是 landing page，直接访问 `dashboard` / `reviews` / `cases`
- 如果 `DATABASE_URL` 未配置，API 会退回 mock mode；公共页面还能看，但 admin / ingestion / 索引链路不完整

## 常用命令

```bash
make help         # 查看所有命令
make ci           # 本地完整 CI
make test-pg      # PostgreSQL 集成测试
make embed        # 生成/回填向量
make db-reset     # 清空并重建本地数据库
```

也可以直接使用：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 测试策略

- 单元测试默认走 mock repository，反馈快
- PostgreSQL 集成测试会创建隔离测试库、回放 migration，并在测试后清理
- 当前已经覆盖的主链包括：
  - review approval -> rebuild_case_search_index
  - pipeline_url_draft -> extract_case_signals
  - taxonomy normalization / taxonomy backfill

运行真实库回归：

```bash
pnpm --filter @sg/api test:pg
```

## 产品路线

当前路线按四层推进：

- `M1` 可信数据底座：真实 DB、snapshot、抽取、taxonomy、索引回填
- `M2` 研究型产品闭环：Topic / 趋势页 / Copilot session / discovery hub
- `M3` 商业化闭环：Free / Pro / Team、watchlist、saved views、导出、账单生命周期
- `M4` 平台化：OTel、worker、Redis、对象存储、nightly regression、alerting、数据质量报表

详细成熟化计划见：[docs/PRODUCT_MATURITY_PLAN.md](docs/PRODUCT_MATURITY_PLAN.md)

## 仓库里最值得看的部分

- `apps/web/app/page.tsx`：首页与 discovery 入口
- `apps/web/app/cases/[id]/page.tsx` / `cases/s/[slug]`：案例详情
- `apps/web/app/admin/reviews/page.tsx`：审核与 ingestion 运营台
- `services/api/src/ingestion/`：source snapshot、抽取、taxonomy backfill、索引链路
- `services/api/src/repositories/`：mock / PostgreSQL 双实现
- `packages/contracts/openapi/startup-graveyard.v1.yaml`：接口契约

## Contributing

欢迎 PR，尤其是下面几类：

- 新失败案例与证据补充
- taxonomy / label / normalization 改进
- ingestion、抽取、索引质量提升
- research workflow、趋势页、专题页
- 测试基线、CI、观测性与部署脚手架

如果你要补案例，建议先参考：

- `db/seed/005_seed_rich_cases.sql`
- `db/seed/010_seed_global_cases.sql`
- `db/seed/012_seed_cn_cases.sql`

## 当前限制

- 仍是 alpha，数据规模和研究工作流还不够深
- Copilot 已有 session、上下文 pin、反馈回路、prompt version、token/cost 追踪、可回放 eval dataset、batch regression 和 nightly scheduler baseline，但还缺 answer grading、自动告警和 CI 级 prompt replay
- 商业化已经有 billing profile、portal、watchlist、saved views、Markdown brief export 和 Team Workspace 基础协作，但 seat 级权益、PDF / 分享交付和订阅运营闭环还没补齐
- 平台化能力还没有上独立 worker / Redis / 对象存储 / OTel

如果你希望把它推进到成熟商业产品，建议直接从 `docs/PRODUCT_MATURITY_PLAN.md` 对照当前分支继续迭代。
