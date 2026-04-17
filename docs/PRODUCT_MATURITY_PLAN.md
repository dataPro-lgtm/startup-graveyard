# Startup Graveyard 产品成熟化计划

更新时间：2026-04-14

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

- Topic/专题研究页、趋势看板、个人 watchlist、saved views、Markdown / PDF 导出、公开 research brief 分享页、Team Workspace 协作基础，以及 team seat 继承权限、降级补偿、账单事件与转化漏斗指标已经上线，但更完整的团队账单自动化仍未落地。
- 首页仍偏“案例站”，离“研究入口 / 决策面板”还有距离。
- Free / Pro / Team 的权益边界已经有了基础模型，商业化能力现在覆盖到 watchlist + saved views + Markdown / PDF export + public brief share + Team Workspace + seat-aware entitlement + downgrade compensation + billing funnel analytics；剩余短板集中在 workspace 级账单自动化运营闭环。

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
- M3.4 订阅运营闭环：seat-aware entitlement、失败补偿、账单告警、到期降级、使用量与转化分析。

### M4 生产级平台化（持续）

目标：支撑规模化内容生产与稳定运营。

- 接入 OTel tracing、关键 metrics、报警和 runbook。
- 引入 Redis、对象存储、独立 worker。
- 视检索压力引入 OpenSearch；视工作流复杂度升级到 Temporal。
- 建立 nightly regression、数据质量报表、检索评测。

已完成 M4 第一段（platform diagnostics baseline）：

- `/v1/admin/stats` 现在会统一返回 `platform` 诊断层，包含 runtime feature flags、Node/env/uptime、最近失败的 ingestion jobs，以及派生出来的 operational alerts。
- Admin Dashboard 已新增 Platform Runtime、Platform Alerts 和 Recent Failed Ingestion Jobs 面板，不再需要运营自己去猜当前环境是不是 mock mode、最近是否有 ingestion 挂掉、恢复链是不是已经开始出现 dead-letter / playbook failure。
- 这一步先解决“后台可见性几乎为空”的问题，把后续 OTel、metrics、worker / queue 基建接入前最需要的运行态和失败态暴露出来。
- 这条诊断链现在还会额外识别超过阈值的 `stale running` ingestion jobs，并允许运营直接从 Dashboard 触发 reclaim，不用再切回 reviews 才能处理卡住的 worker 任务。
- 平台诊断层现在还会暴露 ingestion worker 的运行状态、最近 heartbeat 历史、最近一次 tick、最近处理的 job，以及 stalled / erroring worker 告警，方便判断问题是“队列本身卡住”还是“worker 已经不再消费队列”。
- 诊断层现在还会额外给出 queued backlog 年龄、最老 queued job 和最近一小时吞吐，帮助区分“worker 死掉了”和“worker 还活着，但 ingest 已经开始积压”。
- 运营现在还能从 Dashboard 手动捕获 `platform snapshot`，并通过新的 `capture_platform_snapshot` scheduler job 定时留痕 queue / worker / alert 姿态；后续判断是“瞬时毛刺”还是“持续退化”不再只靠口头描述。
- 在 snapshot history 之上，Dashboard 现在还会给出最近窗口内的 trend 聚合，直接总结 queued / alerts / failed / worker errors 相对起点是上升还是回落，减少人工目测历史卡片的成本。
- 在 trend 之上，Dashboard 现在还会按小时窗口 roll up 最近的 snapshots，直接给出每个窗口内的 queued / alert / failed / worker error 峰值，帮助区分“持续退化”与“单次毛刺”。
- 在 rollup 之上，平台诊断层现在还能直接抬出 `snapshot_trend_regressing` 告警：当最新窗口相较上一窗口出现 queued / alerts / failed / worker errors 回升时，Dashboard 不再只展示历史，而会主动标记“最近窗口正在退化”。
- 在 regression detection 之上，平台层现在还会额外给出 snapshot cadence、missed intervals、regression streak/severity，以及 suppression reason；也就是说运营能分辨“采样本身已经断档”“趋势确实在持续恶化”，还是“退化已被更具体的 queue/worker 告警覆盖，无需重复处理”。
- 在 cadence / suppression 之上，平台层现在还会补一层 24h snapshot metrics surface：scheduled coverage、cadence adherence、regression windows，以及 queue / alert / failed / worker error 的最近峰值，方便运营判断“采样是否持续掉点”与“最近是否频繁出现退化窗口”。

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

已完成 M2 第五段（replayable eval dataset / nightly regression baseline）：

- 新增 `copilot_eval_cases / copilot_eval_batches / copilot_eval_results`，把 Copilot 回放样本、批次摘要和失败样本持久化。
- 新增 `run_copilot_eval_suite` ingestion handler，会回放内置 eval dataset，复用线上 Copilot answer engine，计算 citation recall / precision / pass rate，并把结果写入 batch。
- `scheduled_jobs` 增加 `nightly_copilot_eval_suite`，Admin dashboard 也新增 recent eval batches / latest failures 面板，运营能直接看到最新 prompt regression 是否回退。

已完成 M3 第一段（commercial foundation / watchlist）：

- 用户模型已经从简单的 `free/pro` 扩展成 `free/pro/team + billingStatus + billingInterval + currentPeriodEnd + cancelAtPeriodEnd`，并且 shared 层新增了统一 entitlement helper。
- Stripe 不再只是 checkout：现在支持 customer 绑定、billing portal、`checkout.session.completed` / `customer.subscription.*` 生命周期同步，以及账户页账单状态展示。
- 产品里已经出现第一个真正被付费权益驱动的能力：个人 watchlist。Free 用户会被 entitlement gate 拦住，Pro/Team 可保存案例并在账户页查看自己的研究清单。
- OpenAPI、shared schema、mock route tests 已同步覆盖新的 profile / billing / watchlist 契约，后续实现 saved views 和导出可以沿着这套 entitlement 层继续扩展。

已完成 M3 第二段（saved views / personal paid workflow）：

- 首页现在支持把当前筛选直接保存成个人研究视图，用户不再只能靠 URL 或浏览器书签回到同一组研究上下文。
- API、shared schema、数据库模型已经补齐 `saved views` 的 list / create / rename / delete 闭环，并复用现有 entitlement gating、账户体系和账单升级入口。
- 账户页现在除了 watchlist，还会沉淀第二层个人研究资产 Saved Views，这让 M3 从“只有商业化基础设施”升级成“有真实可感知的个人付费工作流”。

已完成 M3 第二段补充（Markdown export foundation）：

- Pro / Team 用户现在可以把当前筛选或已保存视图导出成 Markdown research brief，包含筛选摘要、样本快照和案例列表。
- 导出逻辑已经进入正式 API 契约与前端工作流，而不是停留在后台手工复制粘贴阶段；后续分享页和客户交付会沿用这套 report generator 继续演进。

已完成 M3 第二段追加（public brief share foundation）：

- Pro / Team 用户现在可以基于 Saved View 生成公开 research brief 分享页，对外发送给客户、合作者或投资委员会，而不必暴露后台账户或筛选操作界面。
- 这套分享页直接复用现有 report generator，会保留筛选摘要、样本快照和代表性案例；`Saved View -> Markdown export -> public brief share` 现在已经是一套统一的交付资产链路。

已完成 M3 第二段追加（PDF brief delivery）：

- Pro / Team 用户现在可以直接把当前筛选或 Saved View 导出成 PDF research brief，用于正式交付给客户、合作者或投委会。
- Public brief 分享页也提供对应的 PDF 下载入口，外部读者可以直接拿到同一份筛选快照的正式文档版本，而不必自己再整理材料。
- PDF 导出和 public brief 共用同一套 report generator / brief payload，这让后续更复杂的客户交付、品牌模版和批量导出有了稳定底座。

已完成 M3 第三段（team workspace foundation）：

- Team 用户现在可以在账户页创建团队工作区，邀请成员，并查看成员、待接受邀请、共享 Saved Views 和共享案例。
- 公开 API、shared schema、数据库模型已经补齐 `team_workspaces / members / invites / shared_saved_views / shared_cases`，mock / PostgreSQL 两套仓库都支持同一套协作闭环。
- 案例详情页与 Saved Views 列表已经接入“共享到 Team Workspace”入口，这让 M3 从个人研究资产沉淀，升级成了基础团队协作资产层。

已完成 M3 第四段第一部分（seat / billing ops foundation）：

- Team Workspace 现在会直接暴露 seat limit、reserved seats、billing owner、账单状态、到期取消标记和风险 warning codes，团队运营状态不再是黑箱。
- 邀请成员已经从“只要点邀请就行”升级成“受 seat limit 和 workspace billing 状态约束”的正式商业化行为；当席位已满或账单已降级时，接口和前端都会给出明确阻断原因。
- 这为后续的失败补偿、自动账单告警和到期降级打下了基础，但这些更深的订阅运营能力还没有全部实现。

已完成 M3 第四段第二部分（workspace entitlement inheritance + ops metrics）：

- 团队成员的有效权限现在不再完全跟随个人套餐，而是会在活跃 Team Workspace 中继承 workspace 级 team entitlement；`/auth/me`、watchlist、saved views 和 Markdown export 都已经切到这套有效权限模型。
- 用户侧账户页会明确展示“个人账单”和“当前有效权限”的差异，避免成员误以为自己仍然是 Free / Pro；加入但已降级的 workspace 也会显示仍按个人套餐生效。
- 运营 Dashboard 现在会聚合 Team Workspace 的数量、active workspaces、seat capacity、reserved seats、pending invites、inherited members、seat utilization 和风险工作区，为后续订阅运营和转化分析提供了第一层观测面。

已完成 M3 第四段第三部分（workspace downgrade compensation）：

- Team Workspace 现在会在 owner 账单降级或席位收紧时自动撤销超出的 pending invites，而不是继续保留无效邀请占着席位。
- 已加入的非 owner 成员在 workspace 不再可继承 Team entitlement 时，会自动回退到各自个人套餐权限；账户页和 Team Workspace 面板都会明确显示这种 fallback，而不是让用户在功能被 gate 后自己猜原因。
- Stripe webhook、Team Workspace context 读取和 admin metrics 都走同一套 reconciliation 逻辑，因此补偿动作既会即时生效，也能在运营台直接看到撤销邀请数和 fallback 成员数。

已完成 M3 第四段第四部分（workspace billing event history / recovery visibility）：

- Team Workspace 现在会为账单降级、席位恢复、自动撤销邀请、成员权限回退和成员权限恢复留下统一的 billing events，不再只有“当前状态”而没有“最近发生了什么”。
- 用户侧 Team Workspace 面板会直接显示最近账单生命周期事件，团队 owner 能看到工作区何时进入降级、何时恢复、撤销了多少邀请、恢复了多少成员权限。
- Admin Dashboard 也会聚合 recent billing events，因此运营不必手工对照用户反馈和当前 seat 状态去猜测恢复动作是否已经发生。

已完成 M3 第四段第五部分（commercial usage / conversion analytics）：

- Admin Dashboard 现在除了 Team Workspace 指标，还会展示订阅转化结构：总用户、Free / Pro / Team 分布、活跃付费用户、past_due 和 cancel-at-period-end 用户，以及 paid conversion / team mix 两条核心比率。
- 已上线的个人付费工作流也被正式收口成运营指标：watchlist 用户数、saved view 用户数、public brief share 用户数、对应资产总量，以及基于活跃付费用户的 research activation / share activation。
- 这意味着当前商业化闭环第一次拥有了“从订阅到研究资产激活”的统一观测面，后续继续做团队账单自动化和转化实验时不再只能靠零散事件判断效果。

已完成 M3 第四段第六部分（Team checkout / upgrade path）：

- 商业化链路不再停留在“只有 Team 能力，没有 Team 购买入口”。`/v1/payments/checkout` 现在正式支持 `pro / team` 两条订阅结账路径，账户页也有从 Free / Pro 直接升级到 Team 的落点。
- Stripe 生命周期同步不再只依赖 metadata；现在会优先根据 active price id 识别 `pro / team`，因此用户在 billing portal 中切换套餐后，系统也能稳定识别并同步正确的计划。
- 这让“个人升级到 Team -> 创建 Team Workspace -> 邀请成员 -> 共享研究资产”第一次成为真正可售卖、可完成支付闭环的产品主链。

已完成 M3 第四段第七部分（workspace recovery actions）：

- Team Workspace 不再只暴露 warning codes 和事件留痕，而是会直接给出推荐恢复动作，例如“重新升级到 Team”“更新支付方式”“恢复自动续费”“释放席位”。
- 账户页的 Team Workspace 面板现在会把这些恢复动作直接展示给 workspace owner，因此用户看到风险后不必自己判断下一步该点哪里。
- Admin Dashboard 也会聚合恢复动作分布和需要处理动作的 workspace 数量，让运营从“看到风险工作区”进一步升级到“知道当前最需要推动哪类恢复动作”。

已完成 M3 第四段第八部分（billing funnel instrumentation）：

- `/v1/payments/checkout` 和 `/v1/payments/portal` 现在会记录来源于账户页或 Team Workspace 的商业化动作，Stripe webhook 还会补记 checkout completed 和 subscription recovered 事件。
- Admin Dashboard 新增了 checkout 发起、checkout 完成率、billing portal 打开次数和订阅恢复次数，并保留最近商业化动作留痕，运营第一次能直接观察“发起升级 -> 完成支付 -> 恢复订阅”的漏斗。
- 这让 M3 的下一步重点更明确地收敛到“基于这些漏斗指标做 workspace 级自动化恢复动作和运营实验”，而不是继续盲目加功能。

已完成 M3 第四段第九部分（invite auto-restore after billing recovery）：

- 当 Team Workspace 因账单降级或席位收紧而自动撤销 pending invites 后，系统现在会在账单恢复、席位重新可用时，自动把可恢复的邀请恢复成 pending，而不是要求 owner 手工重新邀请一遍。
- 这条恢复逻辑已经在 mock 和 PostgreSQL 两套 reconciliation 中保持一致；邀请恢复后，成员侧的 `/v1/team-workspace/me` 会重新看到待接受邀请，并可以直接完成加入。
- Team Workspace recent billing events 也会留下 `invites_auto_restored` 留痕，因此 owner 和运营都能分辨“这次恢复只是恢复了订阅”还是“系统还顺带恢复了被撤销的邀请”。

已完成 M3 第四段第十部分（workspace recovery queue）：

- Admin Dashboard 不再只停留在“风险 workspace 数量”和“恢复动作分布”，而是会直接列出当前需要运营介入的具体 workspace 队列。
- 队列项会带上 workspace 名称、owner、当前套餐 / 账单状态、seat 占用、待接受邀请、已撤销邀请、回退成员、warning codes、推荐恢复动作，以及最近账单事件时间与标题。
- 队列现在还会带上 owner 最近的 checkout / billing portal / subscription recovered 商业化动作，让运营能区分“尚未触达”“已经开始恢复”“刚恢复但仍有其他风险”。
- 这让运营从“知道有风险”进一步升级到“知道该先处理哪个 workspace、该推哪种恢复动作、用户最近有没有实际行动”，也为后续真正的 workspace 级自动化恢复提供了稳定的运营视图。

已完成 M3 第四段第十一部分（workspace billing reconciliation job）：

- Team Workspace 的账单/席位 reconciliation 不再只依赖用户打开账户页或运营打开 dashboard 时被动触发；现在已经有正式的 `reconcile_team_workspace_billing` ingestion handler。
- 这条 handler 会全量重跑 workspace 级账单补偿、pending invite 自动撤销与自动恢复，并可通过 admin scheduler 手动触发，也可由默认 scheduled job 定时执行。
- 因此“账单恢复后邀请自己恢复”第一次成为真正的后台自动化能力，而不是页面读取副作用。

已完成 M3 第四段第十二部分（workspace recovery stages + user-facing notices）：

- Admin Dashboard 的高风险 workspace 队列现在不只区分“有没有动作”，还会给每个 workspace 标记恢复阶段：`尚未触达 / Owner 已开始恢复 / 已恢复待收尾`，运营优先级不再只能靠人工判断最近事件。
- Team Workspace 面板也不再只展示 warning codes。现在会基于当前 viewer 角色生成正式的 recovery notices：owner 会看到恢复订阅、补款、续费、释放席位等明确提示；成员则会看到“当前已回退到个人套餐权限 / 需要联系 owner 恢复”的分层说明。
- 这让恢复闭环第一次同时覆盖“运营视角”和“用户视角”，避免用户只能看到一串技术状态码，却不知道当前该做什么。

已完成 M3 第四段第十三部分（recovery outreach automation baseline）：

- 系统现在已经有正式的 `run_team_workspace_recovery_outreach` ingestion handler，会按当前 workspace 的恢复 notices 和推荐动作，生成持久化的 recovery outreach 记录，而不是只在页面临时拼出提醒文案。
- 这些触达记录会区分 `owner_banner` 和 `admin_queue` 两个 audience/channel，并具备去重与 resolved 收口逻辑：同一 workspace 同一 audience 只会保留一条 pending 触达；当风险消失时，旧触达会自动标记为 resolved。
- 这套收口逻辑也已经开始消费真实商业化动作：当 owner 已经从账户页或 Team Workspace 打开 checkout / billing portal、开始恢复流程时，系统会自动收口 owner 侧 pending outreach，避免同一风险仍被当成“尚未触达”。
- Team Workspace 面板会直接显示 owner 侧最近触达记录，Admin Dashboard 也会展示 recovery outreach 概览与最近触达队列。因此商业化恢复链第一次具备了“定时扫描 -> 持久化触达 -> owner/admin 两侧可见”的稳定基线。
- Admin Dashboard 现在还会为每个高风险 workspace 计算 follow-up cadence：区分 `待首次触达 / 等待 Owner 响应 / 已逾期待跟进 / Owner 已响应 / 恢复待收尾`，并给出下次应跟进时间。运营终于可以按节奏排队，而不只是看“最近一次事件发生在什么时候”。
- recovery outreach 现在不再只是静态 pending 记录。系统会为每条 owner/admin 触达保留 `attemptCount / lastAttemptAt / nextAttemptAt`，并允许 `run_team_workspace_recovery_outreach` 按 `retryIntervalHours` 自动重试逾期触达；运营 dashboard 和 Team Workspace owner 面板都能直接看到当前已经提醒了第几次、下次什么时候会自动再跟进。
- 后台现在还可以直接导出 recovery queue CSV，把 workspace 名称、owner、账单状态、恢复阶段、跟进状态、下次应跟进时间和推荐动作一次性交给运营或外部 CRM 流程，避免还要手工从 dashboard 抄数据。
- 运营现在还可以把最新一条 admin recovery outreach 直接标记为 `handed_off`，记录 `crm / manual_follow_up` 渠道、备注和 `snoozeHours`。在静默窗口结束前，系统不会重新把同一个 admin 触达塞回自动恢复队列；窗口到期后，才会重新进入自动运营链路。
- 在 `handed_off` 之外，这条外部交接链现在还会保留 `exportCount / lastExportedAt`，并提供专门的 CRM handoff CSV 导出接口。运营可以把当前已 handoff 的 workspace 统一导出给 CRM，同时系统会记住这条外部交付已经发过几次、最近一次是什么时候。
- 这轮进一步补上了真实 webhook 交接：已 handoff 的 admin recovery outreach 现在可以直接推送到 `TEAM_WORKSPACE_RECOVERY_WEBHOOK_URL`，系统会回写 `webhookAttemptCount / lastWebhookAttemptAt / nextWebhookAttemptAt / webhookExhaustedAt / webhookDeliveryCount / lastWebhookDeliveredAt / lastWebhookStatusCode / lastWebhookError`，运营台和 owner 面板也能直接看到“待推送 / 自动重试中 / 已推送 / 推送失败 / 已停止自动重试”的状态，而不再只停留在 CSV 导出。
- `deliver_team_workspace_recovery_webhook` 现在不再是“见到 handoff 就全量推一次”，而是只会发送当前到点且仍可重试的 handoff；失败后会按 `retryIntervalHours` 自动排下次重试时间，并在达到 `TEAM_WORKSPACE_RECOVERY_WEBHOOK_MAX_ATTEMPTS` 后转成 dead-letter，停止自动重试。运营台的手动按钮则支持 `force=true` 立即重推，用来覆盖冷却窗口或接管 dead-letter 项。
- 在 dead-letter 之后，系统现在还会把这些 handoff 继续交给内部 Ops Slack：`deliver_team_workspace_recovery_slack_alert` 会扫描 `webhookExhaustedAt` 仍未恢复的 handoff，并把 workspace、owner、账单状态、风险信号和推荐动作推到 `TEAM_WORKSPACE_RECOVERY_SLACK_WEBHOOK_URL`。这一步会持久化 `slackAlertCount / lastSlackAlertAttemptAt / lastSlackAlertedAt / lastSlackAlertStatusCode / lastSlackAlertError`，运营台和 owner 面板也能看见“待通知 Slack / 已告警 / 告警失败”的状态。
- 在通用 webhook 之外，这轮还补了 `deliver_team_workspace_recovery_crm_sync`：`handoff_channel=crm` 的 admin recovery outreach 现在可以直接同步到 `TEAM_WORKSPACE_RECOVERY_CRM_API_URL`，系统会回写 `crmSyncCount / lastCrmSyncAttemptAt / nextCrmSyncAttemptAt / lastCrmSyncedAt / crmExternalRecordId / lastCrmSyncStatusCode / lastCrmSyncError`。运营台因此第一次能直接看到“待同步 CRM / CRM 重试中 / CRM 已同步 / CRM 同步失败”，owner 面板也能看到外部 CRM case 是否已经落地。
- 这轮又补上了真实 owner 邮件通道：`deliver_team_workspace_recovery_owner_email` 会扫描 `owner + pending` 的恢复触达，通过 SMTP 发送恢复邮件，并回写 `emailAttemptCount / lastEmailAttemptAt / nextEmailAttemptAt / lastEmailDeliveredAt / lastEmailMessageId / lastEmailError`。系统只会对当前轮尚未送达的 owner 触达自动补发，触达本身进入下一轮 retry 时会重置邮件状态，因此 owner 面板和运营 dashboard 现在都能明确看到“待发邮件 / 邮件重试中 / 邮件已送达 / 邮件失败”的状态。
- 这轮再往前补了一层真实外发矩阵：`run_team_workspace_recovery_outreach` 在 owner/admin 触达之外，现在还会为当前已回退到个人权限的非 owner 成员生成持久化通知记录；`deliver_team_workspace_recovery_member_email` 会按这些记录通过 SMTP 发出成员回退说明邮件，并回写 `emailAttemptCount / lastEmailAttemptAt / nextEmailAttemptAt / lastEmailDeliveredAt / lastEmailMessageId / lastEmailError`。运营 dashboard 和 owner 侧 Team Workspace 面板因此第一次能直接看到“待发成员邮件 / 成员邮件重试中 / 成员邮件已送达 / 成员邮件失败”的状态。
- `run_team_workspace_recovery_playbook` 现在已经把这层恢复链真正编排起来：它会先刷新 recovery outreach，再串行执行 owner/member 邮件、CRM sync、webhook 和 Slack 升级告警；后台 Dashboard 和 scheduler 都能直接运行这条 playbook，不再要求运营手工逐个点通道。
- recovery playbook 不再只是“跑一下然后页面弹个结果”。系统现在会把每次 playbook run 的 `triggerType / retryIntervalHours / force / requestedSteps / rerunOfRunId / ok / summary / steps / createdAt` 持久化下来，并在 admin stats / Dashboard 里展示最近 run 列表、成功/失败次数、手动/定时占比和最近一次结果。
- 失败 run 现在还可以在 Dashboard 上直接定向补跑失败步骤，而不是把整条 playbook 全量再跑一遍；补跑后的新 run 会显式记录自己是从哪次失败 run 衍生出来的，方便运营回看这次补救动作是否真正收敛问题。
- `run_team_workspace_recovery_playbook` 也已经被提升为正式 scheduled job。账单 reconciliation、recovery outreach 和 recovery playbook 第一次形成稳定的后台自动编排链，而不是停留在“运营手动点一下所有按钮”。
- 这一层现在已经从“内部恢复编排”推进到了“owner 邮件 + 成员回退通知 + CRM API case sync + 通用 webhook + Slack 升级告警 + recovery playbook 编排”的可运营基线，但更深的 Slack/CRM 编排和完整外发告警矩阵仍留在下一阶段，不会和当前已跑通的主链混在一起。
