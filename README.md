# Startup Graveyard — 创业坟场

> 把失败案例从内容库升级为结构化、可检索、可解释的决策知识系统

**Startup Graveyard** 是一个面向创业者、投资人和产品经理的「失败案例情报平台」。不只是读案例，而是回答：我的项目是否正在重蹈覆辙？哪些信号需要警惕？历史上最相似的失败是哪些？

---

## 功能现状（已上线）

### 公开功能
| 功能 | 说明 |
|------|------|
| 案例列表 & 搜索 | 关键词 + trigram 全文检索，支持行业/国家/商业模式/失败原因等多维筛选 |
| 向量语义搜索 | pgvector HNSW 索引，OpenAI text-embedding-ada-002 |
| 案例详情页 | 公司概览、发展时间线、失败因子（3级归因+权重）、证据来源、相似案例推荐 |
| 核心教训模块 | 每个案例的结构化教训，numbered lesson 卡片展示 |
| 相似案例推荐 | 向量近邻检索，自动推荐同类失败案例 |
| Failure Copilot | 自然语言问答，基于案例知识库，支持 OpenAI / Anthropic，含引用 |
| 首页统计横幅 | 收录案例数、总融资蒸发金额、失败模式数、Copilot 入口 |

### 已收录案例（13个）
| 公司 | 行业 | 关闭年 | 总融资 |
|------|------|--------|--------|
| Jawbone | 硬件/可穿戴 | 2017 | $9.3亿 |
| Juicero | 硬件 | 2017 | $1.2亿 |
| Rdio | 音乐流媒体 | 2015 | $1.75亿 |
| Quibi | 短视频 | 2020 | $17.5亿 |
| Fab.com | 电商 | 2015 | $3.1亿 |
| Homejoy | O2O家政 | 2015 | $3800万 |
| Beepi | 二手车 | 2017 | $1.49亿 |
| Vine | 短视频社交 | 2016 | — |
| Airlift | 即时零售 | 2022 | $1.1亿 |
| QuickRide | 摩托出行 | 2020 | — |
| WeWork | 共享办公 | 2023 | $185亿 |
| Theranos | 医疗科技 | 2018 | $9亿 |
| Clubhouse | 音频社交 | — | $1.1亿 |

### 管理后台
- 案例草稿创建 / 编辑 / 审核 / 发布工作流
- 证据来源管理（可信度评级）
- 失败因子结构化录入
- Ingestion 队列管理
- 操作审计日志

---

## 技术栈

```
apps/
  web/          Next.js 16 App Router + Server Components
services/
  api/          Fastify 5 + ESM + Zod + TypeScript
packages/
  shared/       共享 taxonomy（行业/国家/商业模式/失败原因）
  contracts/    OpenAPI 契约
db/
  migrations/   PostgreSQL 迁移（pgvector, pg_trgm, citext）
  seed/         种子数据（案例、时间线、标签、教训）
```

**数据库：** PostgreSQL 16 + pgvector（向量检索）+ pg_trgm（trigram 全文搜索）+ citext

---

## 本地启动

### 前置要求
- Node.js 20+
- pnpm 9+
- Docker

### 1. 启动数据库

```bash
docker compose up -d
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，至少填入：
# DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/sg
# API_BASE_URL=http://127.0.0.1:18080
# OPENAI_API_KEY=your_key  （Copilot & 向量搜索）
```

### 4. 初始化数据库（首次）

按顺序在 PostgreSQL 中执行 `db/migrations/` 和 `db/seed/` 下的 SQL 文件：

```bash
# 示例：用 psql 连接后执行
\i db/migrations/0001_init.sql
\i db/migrations/0002_...
# ... 依此类推
\i db/seed/001_seed_taxonomy.sql
# ... 依此类推
```

### 5. 生成向量 Embedding（可选，相似案例需要）

```bash
cd services/api
node scripts/gen_embeddings.mjs
```

### 6. 启动服务

```bash
# API
pnpm --filter @sg/api build
node services/api/dist/index.js

# Web（另开终端）
pnpm --filter @sg/web build
cd apps/web && npx next start
```

访问地址：
- 前台：http://localhost:3000
- Copilot：http://localhost:3000/copilot
- 管理后台：http://localhost:3000/admin
- API 文档：http://localhost:18080/docs

---

## 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接字符串 |
| `API_BASE_URL` | ✅ | API 服务地址（Web 服务端使用） |
| `ADMIN_API_KEY` | ✅ | 管理后台鉴权 Key |
| `PORT` | — | API 监听端口，默认 18080 |
| `OPENAI_API_KEY` | 推荐 | Copilot LLM + 向量嵌入 |
| `OPENAI_BASE_URL` | — | OpenAI 兼容中转站地址 |
| `OPENAI_CHAT_MODEL` | — | 默认 `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | — | 优先于 OpenAI 使用 |
| `ANTHROPIC_CHAT_MODEL` | — | 默认 `claude-haiku-4-5-20251001` |

---

## 路线图

| 版本 | 目标 |
|------|------|
| **v1（当前）** | 结构化案例库 + 全文/向量搜索 + Copilot 问答 + 核心教训 |
| **v1.5** | 用户账号 + Pro 订阅 + 高级筛选 + 风险清单生成 |
| **v2** | 研究工作台：收藏夹、报告导出、团队协作、开放 API |
| **v3** | 失败情报基础设施：自动采集、风险监控、失败路径图谱 |

---

## 商业模式（规划）

- **免费层：** 基础案例浏览、搜索、每周摘要
- **Pro 层：** 高级筛选、Copilot 深度问答、风险清单、专题导出
- **团队层：** 收藏夹、报告协作、Watchlist、API 接入

---

## Contributing

案例数据录入、失败因子标注、教训提炼——欢迎 PR。
格式参考 `db/seed/005_seed_rich_cases.sql`。
