# Startup Graveyard 产品成熟化计划

更新时间：2026-04-12

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
- Copilot 还是单轮 grounded answer，缺少 session、上下文 pin、反馈回路、评测集、成本追踪。
- 契约与实现存在漂移：OpenAPI 还未完整覆盖 auth/payments/copilot/admin stats/scheduler 等实际接口。

### P1 产品能力

- 缺少 Topic/专题研究页、趋势看板、收藏、保存筛选、watchlist、导出报告、团队协作等中高频工作流。
- 首页仍偏“案例站”，离“研究入口 / 决策面板”还有距离。
- Pro 权益尚未真正 gated，升级文案和价格仍是占位。

### P2 平台化与运营

- 没有 OTel trace、prompt log、token/cost metrics、报警与 runbook。
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
- Copilot 支持 session、上下文 pin、回答反馈、基础 prompt/eval 体系。
- 首页升级为 discovery + research hub，不再只是列表壳。

### M3 商业化闭环（2-3 周）

目标：从 demo 会员升级到真正可售卖产品。

- 明确 Free / Pro / Team 权益边界，并在前后端做 feature gating。
- 完成 Stripe 订阅生命周期、账单状态同步、降级/恢复逻辑。
- 上线保存筛选、收藏/watchlist、导出报告等付费能力。

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
