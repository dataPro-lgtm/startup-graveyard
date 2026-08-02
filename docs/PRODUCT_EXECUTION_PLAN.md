# Startup Graveyard 产品推进执行计划

更新时间：2026-08-02

## 1. 当前结论

Startup Graveyard 已经具备可运行 alpha 的完整骨架，不再缺“功能数量”。当前最主要的问题是：产品能力增长快于发布验证、安全基线和代码边界治理。

现阶段应从“继续横向加功能”切换为“把已有能力变成可重复验证、可安全交付、可持续维护的产品”。

## 2. 真实能力矩阵

| 能力域         | 当前状态         | 已有证据                                            | 主要缺口                                                                 |
| -------------- | ---------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| 公开研究       | Alpha 可用       | 案例检索、详情、Research Hub、Copilot、公开 brief   | 缺少浏览器级主流程发布门禁                                               |
| 内容生产       | 主链已通         | URL snapshot、信号抽取、审核 gate、发布、索引回填   | PostgreSQL 回归尚未进入 CI；内容质量与覆盖规模仍不足                     |
| 个人商业化     | 主链已通         | Watchlist、Saved Views、Markdown/PDF、公开分享      | Stripe sandbox 生命周期未形成端到端验收                                  |
| Team Workspace | 功能较完整       | 邀请、席位、权限继承、共享资产、降级补偿            | 租户隔离与角色权限需要系统化安全回归                                     |
| 订阅恢复运营   | 后台能力较深     | 恢复队列、邮件、CRM、Webhook、Slack、playbook       | 外部通道缺少 staging 级幂等和失败注入验证                                |
| 平台运维       | 可观测基线已形成 | worker/queue/snapshot/regression/suppression/report | scheduler/worker 仍在 API 进程内；缺少 OTel 与独立告警出口               |
| 交付工程       | 部分可靠         | lint、typecheck、mock tests、build、release tag     | 无部署产物、无 staging promotion、无 Web E2E；此前 CI 不跑真实数据库测试 |
| 安全           | 仅具基础线       | admin 默认关闭、生产环境变量 fail-fast              | token 存 localStorage、CORS 全开放、无统一限流与会话设备治理             |
| 可维护性       | 风险上升         | shared schema、OpenAPI、repository abstraction      | dashboard、stats、team repository 已形成超大文件；OpenAPI 仍靠人工同步   |

## 3. 业务主流程

当前应守住两条主链，其他增强能力都围绕它们服务。

### 研究交付链

`发现案例 -> 筛选/专题 -> Copilot 研究 -> Saved View -> Markdown/PDF -> Public Brief -> Team 分享`

### 内容生产链

`Source URL -> Snapshot -> Draft + Evidence -> Signal Extraction -> Review Gate -> Publish -> Search/Copilot Index`

发布门禁必须证明这两条链在真实数据库和浏览器环境中都能跑通。

## 4. 分阶段推进

### 阶段 A：发布可信度（当前阶段）

目标：每次合并都能证明 migration、真实数据库主链、静态检查和生产构建可用。

交付项：

- 将 PostgreSQL + pgvector 集成测试纳入 GitHub Actions 必过门禁。
- 提供本地 `make ci-full`，统一执行格式、lint、类型、mock tests、build 和 PostgreSQL integration tests。
- 保留 mock 业务烟测作为快速反馈，同时明确它不能替代真实数据库或浏览器验收。
- 建立 migration 命名与不可变更规则；现有两个 `0033` 前缀作为历史例外保留，避免已部署环境重复执行迁移。

退出标准：CI 的 `CI OK` 同时依赖静态检查、mock tests、PostgreSQL integration tests 和 production build。

### 阶段 B：真实用户主流程

目标：把“API 能跑”升级为“用户能顺畅完成任务”。

交付项：

- 建立 Playwright 发布烟测，覆盖公开研究、注册登录、Saved View/导出/分享三条路径。
- 增加 admin 内容生产浏览器烟测，覆盖 snapshot、review gate、publish 和公开检索。
- 为 Team Workspace 增加 owner 邀请、member 接受、权限继承和共享资产验收。
- 固化 seed 数据和测试账号，不依赖人工准备状态。

退出标准：一条命令可启动隔离数据库、API、Web，并完成核心浏览器流程。

### 阶段 C：安全与租户边界

目标：达到可邀请外部试用用户的安全底线。

交付项：

- 将 access/refresh token 从 localStorage 迁移到安全 cookie/session 模型。
- CORS 改为环境白名单；为 auth、Copilot、导出和外部 webhook 增加限流。
- 建立 Team Workspace 跨租户访问矩阵测试和审计事件。
- 对 Stripe、邮件、CRM、Webhook、Slack 增加幂等键、重放保护和失败注入测试。

退出标准：关键权限和外部副作用均有自动化负向测试，不依赖前端隐藏按钮保证安全。

### 阶段 D：平台解耦与可观测性

目标：API、worker、scheduler 可独立扩缩容并可定位故障。

交付项：

- 拆分 `teamWorkspacesRepository`、admin stats 和 dashboard 的领域模块。
- 将 ingestion worker/scheduler 从 API 进程拆出，明确队列租约、重试和 dead-letter 语义。
- 接入 OTel traces、稳定 metrics 出口和告警路由；把现有 snapshot diagnostics 作为运营层摘要。
- 建立可部署镜像、staging 环境、数据库备份恢复和 rollback runbook。

退出标准：worker 故障不影响 API 可用性，关键 incident 可通过 trace、metric 和 runbook 定位与恢复。

### 阶段 E：数据规模与商业增长

目标：证明产品价值和可持续商业化，而不是继续堆内部能力。

交付项：

- 将高质量案例提升到 200+，并建立来源覆盖、证据完整度、taxonomy 一致性质量报表。
- 为检索和 Copilot 建立离线 eval 阈值、nightly regression gate 和人工复核样本池。
- 完成 Stripe sandbox 的 checkout、升级、降级、past-due、恢复全生命周期验收。
- 围绕 research activation、brief share、workspace activation 和 paid conversion 做有限实验。

退出标准：数据质量、研究价值、可靠性和付费转化都有连续可观测指标。

## 5. 当前不进入范围

- 在真实搜索压力出现前，不提前引入 OpenSearch。
- 在队列语义和故障模型明确前，不直接迁移 Temporal。
- 在核心浏览器主链成为门禁前，不继续扩展新的恢复外发通道。
- 在租户边界回归补齐前，不扩大 Team Workspace 的角色复杂度。

## 6. 执行原则

- 每一阶段必须有自动化退出标准，不能以“代码已写”视为完成。
- 新能力优先复用 shared schema、OpenAPI 和现有 repository，不建立平行契约。
- mock tests 用于快速反馈，PostgreSQL 和浏览器测试用于发布可信度。
- 先拆清领域边界，再替换基础设施；基础设施升级不能掩盖业务语义不清。

## 7. 阶段 A 当前落地

- GitHub Actions 已增加独立 PostgreSQL + pgvector integration job，并纳入 `CI OK`。
- 本地新增 `make ci-full`，migration 文件新增自动校验与历史 `0033` 冲突说明。
- 新增 migration、API、Web 三类生产镜像及单机生产 Compose 基线；启动顺序与健康检查已固化。
- 生产 migration runner 已实现单迁移原子提交，并验证首次应用 34 个迁移、二次运行全部幂等跳过。
- Next Web 已生成 standalone 产物，浏览器 API 地址改为使用 `NEXT_PUBLIC_API_BASE_URL`，不再错误回退到 `localhost:8080`。
- 生产 Compose 已完成真实浏览器注册验收，客户端请求正确命中独立 API；自动化 Playwright 门禁仍属于阶段 B。
- 首次真实库门禁发现并修复了 timeline extraction 对 `started rapid expansion` 的误分类与重复事件问题。
- 阶段 A 剩余工作是把浏览器主链提升为自动化发布门禁；该项作为阶段 B 的首个交付继续推进。
