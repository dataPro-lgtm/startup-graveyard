# Startup Graveyard 产品推进执行计划

更新时间：2026-08-03

## 1. 当前结论

Startup Graveyard 已经具备可运行 alpha 的完整骨架，不再缺“功能数量”。当前最主要的问题是：产品能力增长快于发布验证、安全基线和代码边界治理。

现阶段应从“继续横向加功能”切换为“把已有能力变成可重复验证、可安全交付、可持续维护的产品”。

## 2. 真实能力矩阵

| 能力域         | 当前状态         | 已有证据                                             | 主要缺口                                                               |
| -------------- | ---------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| 公开研究       | Alpha 可用       | 案例检索、详情、Research Hub、Copilot、公开 brief    | 需扩充数据覆盖与 Copilot 离线评测                                      |
| 内容生产       | 发布主链已验收   | URL snapshot、信号抽取、审核 gate、发布、索引回填    | 内容质量与覆盖规模仍不足                                               |
| 个人商业化     | 浏览器主链已验收 | Watchlist、Saved Views、Markdown/PDF、公开分享       | Stripe sandbox 生命周期未形成端到端验收                                |
| Team Workspace | 协作主链已验收   | 邀请、席位、权限继承、共享资产、降级补偿             | 租户隔离与角色权限需要系统化安全回归                                   |
| 订阅恢复运营   | 后台能力较深     | 恢复队列、邮件、CRM、Webhook、Slack、playbook        | 外部通道缺少 staging 级幂等和失败注入验证                              |
| 平台运维       | 生产基线已形成   | 独立 runtime、heartbeat、OTel、Prometheus、持久告警  | 缺业务 SLO、集中 Collector 和正式 incident 演练                        |
| 交付工程       | 单机发布可验证   | 生产镜像、真实 PostgreSQL、Playwright、CI 门禁       | 无 staging promotion、备份恢复演练和正式 rollback 验收                 |
| 安全           | 外部试用基线完成 | HttpOnly 会话、CORS 白名单、限流、设备撤销、租户测试 | 仍需密钥轮换、渗透测试、数据保留与删除治理                             |
| 可维护性       | 风险上升         | shared schema、OpenAPI、repository abstraction       | dashboard、stats、team repository 已形成超大文件；OpenAPI 仍靠人工同步 |

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
- 生产 migration runner 已实现单迁移原子提交，并验证完整迁移集与二次运行幂等跳过。
- Next Web 已生成 standalone 产物，浏览器 API 地址改为使用 `NEXT_PUBLIC_API_BASE_URL`，不再错误回退到 `localhost:8080`。
- 生产 Compose 已完成真实浏览器注册验收，客户端请求正确命中独立 API。
- 首次真实库门禁发现并修复了 timeline extraction 对 `started rapid expansion` 的误分类与重复事件问题。
- 阶段 A 已通过 PR #1 合并；阶段 B 已完成核心用户与内容发布主链验收。

## 8. 阶段 B 当前落地

- 新增一条命令的 Playwright runner：自动创建隔离 PostgreSQL 数据库、执行真实 migration/seed、构建 API/Web 并分配隔离端口。
- 浏览器门禁覆盖公开案例、Pro 交付、移动导航、Copilot 降级、Team owner/member 协作与 Admin 证据门禁发布。
- 浏览器门禁不向生产 API 增加测试后门；付费权益 fixture 直接作用于隔离测试数据库。
- GitHub Actions 新增 `Browser Release Gate`，并纳入 `CI OK` 强制依赖。
- Admin Web 已从公开导航移除；历史 Basic + 共享密钥方案已由具名管理会话和四级 RBAC 替代。
- 生产 Compose 默认只运行 migration，demo/验收数据由幂等 `prod-seed` 命令显式初始化。
- Team 成员接受邀请后立即刷新有效权益；Copilot 在 AI provider 故障时减少重复 embedding 请求并收紧精确公司引用。

## 9. 2026-08-02 用户角色审计与后续优先级

本轮按匿名访客、Free/Pro 用户、Team owner/member 和内容运营员五类角色走查，阶段 B 退出标准已达成。

| 优先级 | 下一阶段工作                                            | 验收标准                                             |
| ------ | ------------------------------------------------------- | ---------------------------------------------------- |
| P0     | 安全 cookie/session、CORS 白名单、auth/Copilot/导出限流 | 凭据不可被页面脚本读取，跨域和超频负向用例进入 CI    |
| P0     | Team 跨租户读写矩阵与 Admin 应用角色                    | owner/admin/member/非成员对每类资源都有 API 负向测试 |
| P1     | Stripe sandbox 全生命周期与外部通道失败注入             | checkout、升降级、past-due、恢复、重放均可自动验收   |
| P1     | 业务 SLO、Collector 与 incident 演练                    | 关键链路有 SLO，告警可定位并按 runbook 恢复          |
| P2     | 200+ 证据化案例、Copilot offline eval 与 nightly gate   | 引用命中、幻觉、降级和数据质量指标连续达标           |

## 10. 阶段 C 当前落地

- CORS 已从反射任意来源改为精确来源白名单，生产启动校验拒绝路径、通配符和非 HTTP(S) 来源。
- Admin API 已复用用户与可撤销设备会话，按 Viewer/Editor/Operator/Owner 能力授权并记录具名主体。
- Admin Web 使用独立 Host-only HttpOnly 会话，支持服务端刷新、角色降级即时拒绝与显式退出；Web 不再持有共享管理密钥。
- Stripe webhook 使用原子事件账本、处理租约、失败重试和 source event 唯一约束；平台指标暴露失败、卡住与重试情况。
- Stage C 的安全退出标准、上线顺序与回滚边界已经落实到发布门禁和 `docs/DEPLOYMENT.md`。
- 认证注册/登录、token refresh、Copilot answer、报告生成、Stripe checkout/portal/webhook 已启用分层限流。
- 有效登录用户按用户主体限流，匿名和无效凭据按可信客户端 IP 限流；令牌不会进入限流存储键。
- 安全负向测试覆盖不受信来源无 CORS 授权、认证超频、refresh 独立预算、Copilot 与导出超频。
- Web access/refresh 凭据已从 localStorage 迁移到 Host-only `HttpOnly + Secure + SameSite` Cookie；浏览器来源响应不再返回 bearer token。
- Cookie 状态变更增加可信 Origin 校验，非浏览器 bearer 客户端继续兼容，生产公网禁止关闭 Secure Cookie。
- 刷新令牌改为 SHA-256 摘要存储；账户支持最多 10 个设备、活跃会话清单、单设备撤销和退出其他设备。
- Access token 绑定 session id，被撤销设备的现有 access/refresh 凭据立即失效；登录与刷新会更新 IP、User-Agent 和最近活跃时间。
- Team 跨租户负向矩阵覆盖 owner/admin/member/non-member 的上下文读取、成员邀请、共享 Saved View 和邀请标识枚举；不属于当前用户的邀请统一返回 not found。
- Admin 具名角色、Stripe 事件账本与幂等生命周期基础已经进入发布门禁。

## 11. 阶段 D/E 当前落地

- API、worker、scheduler 已拆为独立进程，共用不可变 API 镜像并通过数据库 heartbeat 暴露真实运行状态。
- 每个进程拥有独立 OpenTelemetry service identity、私有 Prometheus endpoint 和可选 OTLP trace exporter。
- HTTP、ingestion、scheduler、heartbeat 与平台快照使用有界标签指标，浏览器门禁会抓取三个 metrics endpoint。
- `0038` 持久化每个告警和通道的冷却、失败重试、严重度升级与恢复投递状态，多实例只允许一个投递者领取。
- Prometheus 配置和 5 条基础告警规则进入本地与 CI `promtool` 校验；操作手册见 `docs/OBSERVABILITY_RUNBOOK.md`。
- 下一阶段转向商业价值验证：业务 SLO、200+ 治理案例、Copilot nightly eval、Stripe sandbox 生命周期和增长漏斗。

## 12. M5 商业化就绪批次（2026-08-03，分支待合并）

本批按"敢向真实用户收费"的最短路径补齐用户自助闭环与商业门面，四个 feature 分支待评审合并：

| 分支                                     | 内容                                                                                                            | 验收                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `feature/m5-password-reset`              | 密码找回全链路：`0039` 摘要化一次性令牌、防枚举 forgot/reset 接口、限流+审计+重置后吊销全部设备会话、Web 页面   | 6 个新 mock 测试；typecheck/build 绿        |
| `feature/m5-pricing-legal-pages`         | 独立 `/pricing`（权益由 shared billing 单一来源推导）、`/legal/terms`、`/legal/privacy`、全站页脚、sitemap      | 生产构建绿；浏览器实测渲染                  |
| `feature/m5-email-verification`          | `0040` email_verified_at + 验证令牌、注册即发验证邮件、verify/resend 接口、Web 验证页（栈于 password-reset 上） | 5 个新 mock 测试；暂不做功能门控            |
| `feature/m5-stripe-lifecycle-acceptance` | 订阅全生命周期合成事件验收（升降级/past-due/恢复/挂起取消/删除）+ 真实签名 HTTP webhook 重放与篡改负向          | 5 个新测试；真实 sandbox e2e 仍需运营方凭据 |

合并顺序建议：password-reset -> email-verification（栈式）；pricing-legal 与 stripe-lifecycle 独立可并行。

### M5 之后的优先级（更新）

| 优先级 | 工作                                                      | 验收标准                                    |
| ------ | --------------------------------------------------------- | ------------------------------------------- |
| P0     | 拆分 `teamWorkspacesRepository`、admin stats 与 dashboard | 单文件不超过约 1500 行，领域模块有独立测试  |
| P1     | Stripe sandbox 真实凭据端到端 + 邮箱验证接入功能门控策略  | sandbox checkout/portal 全流程可自动验收    |
| P1     | 业务 SLO、集中 Collector 与 incident 演练                 | 关键链路有 SLO，告警可定位并按 runbook 恢复 |
| P2     | 200+ 证据化案例、Copilot offline eval 与 nightly gate     | 引用命中、幻觉、降级和数据质量指标连续达标  |
| P2     | OpenAPI 契约自动生成或契约测试，替代人工同步              | 契约漂移在 CI 中可检出                      |
