# Stage E: Production Observability and Alert Routing

更新时间：2026-08-02

## 目标

在不复制业务指标模型的前提下，为 API、worker、scheduler 建立生产级故障定位闭环：基础设施指标可抓取，关键操作可追踪，平台告警可自动投递且不会重复轰炸。

## 分阶段交付

### E1 Telemetry runtime

- [x] 每个进程拥有独立 OpenTelemetry service identity。
- [x] 独立 Prometheus endpoint 不通过公网端口发布。
- [x] OTLP trace exporter 可选配置，进程停止时统一 flush 和 shutdown。

### E2 Critical-path instrumentation

- [x] HTTP 使用规范化 route 标签，禁止 query、用户 ID 等高基数属性。
- [x] worker、scheduler、heartbeat 记录吞吐、耗时和错误结果。
- [x] platform snapshot 将 queue 和 alert 摘要投影到稳定 gauges。

### E3 Alert delivery control plane

- [x] PostgreSQL 持久化每个 alert code/channel 的活动状态。
- [x] 冷却窗口内抑制重复投递，严重度升级可立即重发。
- [x] 支持 webhook、Slack、firing/recovery 失败重试和恢复通知。

### E4 Operations

- [x] Prometheus scrape 配置、告警规则和运维 runbook 可直接验证。
- [x] Compose 明确内部 metrics 端口和 OTLP 环境变量。
- [x] 单独记录 Vercel 重复项目解绑步骤，避免外部状态污染 PR 反馈。

## 退出标准

1. 三个进程均可被 Prometheus 抓取，且 label cardinality 有界。
2. HTTP、ingestion job、scheduler tick 可产生 trace；未配置 collector 时不阻塞业务。
3. 同一告警在冷却窗口内只投递一次，升级和恢复各产生一次通知。
4. metrics、OTLP、告警去重均有自动化测试，四进程浏览器门禁保持通过。
5. `make ci-full`、容器构建和真实 Compose smoke 全部通过后才允许合并。
