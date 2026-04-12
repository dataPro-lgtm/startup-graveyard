# Startup Graveyard 产品成熟化计划

更新时间：2026-04-13

## 1. 当前判断

当前仓库已经不是“空壳 bootstrap”，而是一个可运行的 v1 alpha：

- Public：案例列表、筛选、详情、相似案例、Copilot 问答。
- Admin：草稿创建、审核、附件录入、入库任务、审计、运营 dashboard。
- Platform：PostgreSQL + pgvector、基础 migration/seed、Stripe 升级入口、CI/Release 工作流雏形。

但它距离“成熟商业产品”还有明显差距。现在更准确的定位是：

> 一个已经具备结构化案例库雏形的 alpha 产品，而不是可稳定商业化运营的 failure intelligence platform。

## 2. 与文档目标的主要差距

### P0 基础工程与交付可靠性

- CI 基线不稳：`pnpm lint` 当前失败，`apps/web` 仍使用 Next 16 已移除的 `next lint --no-cache`。
- 缺少真实数据库集成测试：现有 API tests 主要跑 mock 仓库，无法覆盖 migration、SQL 查询、发布态流转。
- Release 基线不完整：根 `package.json` 无版本号，release workflow 会退化到 `v0.0.0`。
- 运行环境校验弱：关键环境变量缺少启动期 fail-fast 校验。

### P0 安全与权限

- `/v1/admin/*` 在 `ADMIN_API_KEY` 未配置时默认开放，这不符合任何商业产品的最小安全要求。
- 用户鉴权仍是前端 localStorage token 模式，没有 httpOnly cookie、会话设备管理、风控、限流、审计增强。
- 支付只完成最小 checkout/webhook，没有账单状态、订阅生命周期、幂等与失败补偿。

### P1 数据生产与质量闭环

- 采集仍是轻量 job + 手动录入，不是文档中定义的“采集 -> 抽取 -> 去重 -> chunk -> embedding -> 审核 -> 发布”完整链路。
- 没有 source snapshot / object storage / dedupe / extraction / quality gates。
- review flow 还是简化态，缺少 changes requested、SLA、版本比对、质量评分。
- 数据覆盖仍远低于 PRD 提到的 200-500 高质量案例目标。

### P1 检索与 Copilot

- 当前主要是 PostgreSQL + pgvector 混合排序，OpenSearch hybrid/facet/explain 尚未落地。
- Copilot 已支持 session、上下文 pin、回答反馈，以及 run-level prompt version / token-cost 追踪、可回放评测集、batch regression 和后台回归视图，但仍缺 answer grading、自动告警与更系统的质量回归。
- 契约漂移已经明显收敛，但 OpenAPI 对 auth/payments/admin stats/scheduler 等实际接口仍未完全覆盖。

### P1 产品能力

- Topic/专题研究页、趋势看板和个人 watchlist 已经上线，但保存筛选、导出报告、团队协作仍未落地。
- 首页仍偏“案例站”，离“研究入口 / 决策面板”还有距离。
- Free / Pro / Team 的权益边界已经有了基础模型，但只有 watchlist 完成了真正的付费 gating；saved views、导出、Team workspace 还没跟上。

### P2 平台化与运营

- 没有 OTel trace、自动告警、CI 级 prompt replay 与 runbook。
- 没有 Redis、对象存储、worker 独立部署、Temporal durable workflow。
- 没有数据回填、夜间回归、搜索评测、内容质量报表。

## 3. 成熟化路线图

### M0 基线硬化（立即）

目标：让仓库先成为“可靠可迭代的软件项目”。

- 修复 lint/CI，确保 `lint/typecheck/test/build` 全绿。
- 管理面默认关闭裸奔访问。
- 首页关键指标改为真实聚合数据，避免误导。
- 建立仓库内成熟化计划文档与验收标准。

### M1 可信数据底座（1-2 周）

目标：把结构化案例库做成可持续生产的数据产品。

- 完成真实 DB 集成测试与 seed 验证。
- 补齐 source snapshot、抽取任务、chunk、embedding 回填链路。
- 扩展 review workflow：changes requested、publish gate、质量检查项。
- 统一 OpenAPI、shared schema 与实现，消除契约漂移。

### M2 研究型产品闭环（2-3 周）

目标：从“可浏览”升级到“可研究”。

- 上线 Topic / 专题页、趋势页、预设研究入口。
- Copilot 支持 session、上下文 pin、回答反馈，以及基础 prompt version / eval / cost tracking 体系。
- 首页升级为 discovery + research hub，不再只是列表壳。

### M3 商业化闭环（2-3 周）

目标：从 demo 会员升级到真正可售卖产品。

- M3.1 商业化基础层：明确 Free / Pro / Team 权益边界，补 billing profile、账单状态同步、Portal 与统一 entitlement helper。
- M3.2 个人付费工作流：上线保存筛选、watchlist、导出报告等真实可感知的个人付费能力。
- M3.3 团队商业化：团队工作区、共享 watchlist / saved views、成员与权限管理。
- M3.4 订阅运营闭环：失败补偿、账单告警、到期降级、使用量与转化分析。

### M4 生产级平台化（持续）

目标：支撑规模化内容生产与稳定运营。

- 接入 OTel tracing、关键 metrics、报警和 runbook。
- 引入 Redis、对象存储、独立 worker。
- 视检索压力引入 OpenSearch；视工作流复杂度升级到 Temporal。
- 建立 nightly regression、数据质量报表、检索评测。

## 4. 当前执行顺序

按“先把底盘打稳，再扩产品面”的原则，优先级如下：

1. 先修复工程与安全基线。
2. 再补数据生产闭环与契约一致性。
3. 再推进研究工作流与商业化功能。
4. 最后上平台化基础设施。

## 5. 已落地进展

已完成 M0：

- 修复 lint/CI 基线。
- 收紧 admin 默认访问策略。
- 提供真实首页 summary 数据。
- 用测试把上述行为钉住。

已完成 M1 第一段：

- 审核流扩展为 `pending -> changes_requested -> pending -> approved/rejected`。
- `approve` 新增 publish gate，至少要求 1 条证据来源和 1 个失败因子。
- 审核列表返回 publish readiness，运营台可直接看到缺口。
- OpenAPI 已同步到新的 review 状态机与错误语义。

已完成 M1 第二段（数据来源留痕）：

- 新增 `source_snapshots`，抓取 URL 时会保存标题、摘要、内容 hash 与元数据。
- `pipeline_url_draft` 升级为 `抓取 -> snapshot -> draft -> evidence`。
- Admin 运营台可直接查看最近抓取的 source snapshots。

已完成 M1 第三段（索引回填）：

- 新增 `rebuild_case_search_index` / `backfill_case_search_index`，会从 case + evidence + failure factors + timeline + lessons 生成 `case_chunks`，并同步回填 `case_embeddings`。
- 审核通过后会自动排入索引任务，API 进程内 worker 会持续处理队列，不再依赖人工逐条点“处理下一条”。
- Chunk embedding 默认优先走 OpenAI 批量 embedding，失败时降级为确定性向量，保证索引链路不中断。

已完成 M1 第四段（轻量结构化抽取）：

- 新增 `extract_case_signals`，会从 source snapshot 自动抽取 primary failure reason、failure factors、timeline events 与 key lessons。
- `pipeline_url_draft` 现在会自动排入 follow-up extraction job，而不是只停留在“有 snapshot + 有 draft”。
- Admin case 页面补齐了时间线和分析修正入口，运营可对自动抽取结果做人工兜底。

已完成 M1 第五段（真实 PostgreSQL 回归基线）：

- 新增 PostgreSQL 集成测试 harness，会创建隔离测试库、回放全部 migration，并在测试后自动清理。
- 补了两条真实库主链断言：`review approval -> rebuild_case_search_index` 与 `pipeline_url_draft -> extract_case_signals`。
- 默认单元测试仍走 mock；需要真实库验证时可执行 `pnpm --filter @sg/api test:pg`。

已完成 M1 第六段（taxonomy 规范化）：

- shared taxonomy 扩展为产品可用的枚举层：补齐 primary failure reasons、failure-factor level1/level2、timeline event types 的标签与别名归一化。
- Admin 草稿录入 / case 修正页改为基于 taxonomy 的选项化输入，减少自由文本导致的脏数据。
- API schema 会在写入前把常见别名、大小写、空格形式归一成 canonical key，Case Detail 展示也统一走标签映射。

已完成 M1 第七段（历史 taxonomy 回填）：

- 新增 `backfill_case_taxonomy` ingestion job，会批量扫描历史 case / failure_factors / timeline_events，把旧的 freeform/alias key 回填成 canonical taxonomy。
- 回填完成后，会为受影响的 published case 自动排入 `rebuild_case_search_index`，避免搜索索引、筛选统计和详情展示继续读取旧 key。
- 新增纯规则测试与 PostgreSQL 集成回归，保证历史脏数据修复后，公开接口与索引层看到的是一致的 canonical 值。

已完成 M2 第一段（Research Hub / 预设专题）：

- 新增 `/v1/meta/research-overview`，把首页 summary、热门行业、热门国家、热门失败主因和倒闭时间线收口成研究型聚合接口。
- Web 新增 `/research` 页面，提供预设专题入口、趋势聚合面板、最新案例流，并可一键带着问题跳转到 Copilot。
- 首页与顶层导航已接入 Research Hub，产品入口从“单纯搜索列表”升级为“搜索 + 研究”双入口。

已完成 M2 第二段（Copilot research workspace）：

- Copilot 新增持久化 session、消息历史、上下文 pin 和回答反馈，问答从“单轮回答”升级成“可连续研究”的工作线程。
- API 新增 `/v1/copilot/sessions`、`/pins`、`/messages/:messageId/feedback` 等接口，OpenAPI 与 shared schema 已同步覆盖。
- Web Copilot 页面升级成多会话研究工作台，支持保留线程、固定关键案例、连续追问与标记回答质量。

已完成 M2 第三段（Copilot prompt / telemetry baseline）：

- Copilot system prompt 已收口为可版本化的 `copilotPrompt` 模块，并在每次回答 run 中持久化 `promptVersion`。
- 新增 `copilot_runs`，记录 provider、model、fallback reason、响应耗时、token 用量、估算成本、检索案例数、引用数等 run-level 指标。
- Web Copilot 会在消息详情里展示 prompt 版本、响应耗时、token/cost 与降级原因，为后续 eval、prompt 回归和运营 dashboard 提供基础数据。

已完成 M2 第四段（feedback-based eval / regression dashboard）：

- Admin `/v1/admin/stats` 现在会返回 Copilot telemetry 聚合，包括 runs、grounded/fallback、feedback eval、prompt version 对比、fallback 原因和 recent flagged runs。
- Copilot repo 补了 mock / PostgreSQL 两套 `getAdminMetrics()`，后台 dashboard 在 mock 和真实库模式下都能展示研究助手运营数据。
- Admin dashboard 新增 Copilot KPI、prompt version regression 视图和 recent flagged runs 列表，运营能直接看到哪个 prompt 版本、哪类 fallback、哪些回答最需要修正。

已完成 M3 第一段（commercial foundation / watchlist）：

- 用户模型已经从简单的 `free/pro` 扩展成 `free/pro/team + billingStatus + billingInterval + currentPeriodEnd + cancelAtPeriodEnd`，并且 shared 层新增了统一 entitlement helper。
- Stripe 不再只是 checkout：现在支持 customer 绑定、billing portal、`checkout.session.completed` / `customer.subscription.*` 生命周期同步，以及账户页账单状态展示。
- 产品里已经出现第一个真正被付费权益驱动的能力：个人 watchlist。Free 用户会被 entitlement gate 拦住，Pro/Team 可保存案例并在账户页查看自己的研究清单。
- OpenAPI、shared schema、mock route tests 已同步覆盖新的 profile / billing / watchlist 契约，后续实现 saved views 和导出可以沿着这套 entitlement 层继续扩展。

已完成 M2 第五段（replayable eval dataset / nightly regression baseline）：

- 新增 `copilot_eval_cases / copilot_eval_batches / copilot_eval_results`，把 Copilot 回放样本、批次摘要和失败样本持久化。
- 新增 `run_copilot_eval_suite` ingestion handler，会回放内置 eval dataset，复用线上 Copilot answer engine，计算 citation recall / precision / pass rate，并把结果写入 batch。
- `scheduled_jobs` 增加 `nightly_copilot_eval_suite`，Admin dashboard 也新增 recent eval batches / latest failures 面板，运营能直接看到最新 prompt regression 是否回退。

已完成 M3 第一段（commercial foundation / watchlist）：

- 用户模型已经从简单的 `free/pro` 扩展成 `free/pro/team + billingStatus + billingInterval + currentPeriodEnd + cancelAtPeriodEnd`，并且 shared 层新增了统一 entitlement helper。
- Stripe 不再只是 checkout：现在支持 customer 绑定、billing portal、`checkout.session.completed` / `customer.subscription.*` 生命周期同步，以及账户页账单状态展示。
- 产品里已经出现第一个真正被付费权益驱动的能力：个人 watchlist。Free 用户会被 entitlement gate 拦住，Pro/Team 可保存案例并在账户页查看自己的研究清单。
- OpenAPI、shared schema、mock route tests 已同步覆盖新的 profile / billing / watchlist 契约，后续实现 saved views 和导出可以沿着这套 entitlement 层继续扩展。
