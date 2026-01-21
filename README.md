# 创业坟场 (Startup Graveyard) 💀

一个记录和分析创业失败案例的数据库平台，为创业者提供借鉴和警示。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)

## ✨ 功能特性

- 📊 **失败案例数据库** - 收录历史上知名的创业失败案例
- 🔍 **智能搜索** - 支持按公司名称、行业、失败原因等搜索
- 🎯 **多维筛选** - 按行业、失败原因、国家、年代等筛选
- 📈 **数据可视化** - 行业分布、失败原因统计、国家分布等炫酷图表
- 📝 **深度分析** - 每个案例包含详细的失败分析和经验教训
- 💡 **经验总结** - 从失败中提炼可借鉴的经验教训
- 🤖 **自动数据采集** - 支持多数据源自动采集失败案例
- ⏰ **定时任务** - 按天自动采集最新数据

## 🛠️ 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **图表**: Recharts
- **图标**: Lucide React
- **定时任务**: node-cron
- **数据采集**: axios, cheerio

## 🚀 快速开始

### 本地开发

```bash
# 安装依赖
npm install

# 初始化数据
npm run init-data

# 启动开发服务器
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 生产部署

#### 🐳 Docker 部署（简化版）
查看 [DOCKER_QUICK_START.md](./DOCKER_QUICK_START.md)

#### 原生部署
- Ubuntu/Debian: [ALIYUN_DEPLOY.md](./ALIYUN_DEPLOY.md)
- CentOS 7: [CENTOS7_DEPLOY.md](./CENTOS7_DEPLOY.md)

### 构建生产版本

```bash
npm run build
npm start
```

## 📁 项目结构

```
startup-graveyard/
├── app/                    # Next.js App Router 页面
│   ├── api/               # API 路由
│   │   ├── collect/       # 数据采集API
│   │   ├── collections/   # 采集记录API
│   │   ├── cron/          # 定时任务API
│   │   └── startups/      # 数据API
│   ├── admin/             # 管理页面
│   ├── startup/[id]/      # 详情页
│   ├── layout.tsx         # 根布局
│   ├── page.tsx           # 首页
│   └── globals.css        # 全局样式
├── components/            # React 组件
│   ├── StartupCard.tsx   # 项目卡片
│   ├── SearchBar.tsx     # 搜索栏
│   ├── FilterPanel.tsx   # 筛选面板
│   └── StatsPanel.tsx    # 统计面板
├── lib/                   # 工具库
│   ├── collectors/        # 数据采集器
│   │   ├── base.ts       # 基础采集器
│   │   ├── webCollector.ts # 网页采集器
│   │   ├── aiCollector.ts  # AI采集器
│   │   └── manualCollector.ts # 手动采集器
│   ├── collectorManager.ts # 采集管理器
│   ├── dataProcessor.ts   # 数据处理器
│   ├── database.ts        # 数据库操作
│   └── cron.ts            # 定时任务
├── data/                  # 数据文件
│   ├── startups.ts        # 默认案例数据
│   ├── startups.json      # 案例数据（自动生成）
│   └── collections.json   # 采集记录（自动生成）
├── types/                 # TypeScript 类型定义
└── scripts/               # 工具脚本
    ├── init-data.mjs      # 初始化数据
    └── test-*.mjs         # 测试脚本
```

## 📊 数据模型

每个失败案例包含以下信息：

- **基本信息**: 名称、行业、成立/关闭时间、存活年数
- **财务数据**: 融资总额、亏损金额
- **失败原因**: 多维度分析失败原因
- **深度分析**: 详细的失败过程分析
- **经验教训**: 可借鉴的经验总结
- **关联信息**: 投资者、创始人、标签等

## 🎨 设计理念

- **暗色主题** - 符合"坟场"的严肃主题，营造庄重氛围
- **数据驱动** - 通过数据可视化展示失败模式
- **易用性** - 简洁直观的界面，快速找到相关信息
- **教育价值** - 不仅记录失败，更提炼经验教训
- **个性化设计** - 炫酷的动画效果和交互体验

## 🔧 数据采集

### 手动采集

访问管理页面：`http://localhost:3000/admin`

或使用API：
```bash
curl http://localhost:3000/api/collect/test
```

### 定时任务

在管理页面启动定时任务，系统会在每天凌晨2点自动采集数据。

### 配置数据源

编辑 `lib/collectors/webCollector.ts` 添加新的数据源。

## 📝 API文档

### 数据采集

- `GET /api/collect/test` - 测试采集（不需要认证）
- `POST /api/collect` - 正式采集（可能需要认证）
- `GET /api/collect/status` - 获取采集器状态

### 采集记录

- `GET /api/collections` - 获取采集记录和统计

### 定时任务

- `GET /api/cron/status` - 获取定时任务状态
- `POST /api/cron` - 启动/停止定时任务

### 数据

- `GET /api/startups` - 获取所有案例数据

## 🧪 测试

查看 [TESTING.md](./TESTING.md) 了解详细的测试方法。

## 📖 文档

- [后端数据采集系统文档](./README-BACKEND.md)
- [测试指南](./TESTING.md)

## 🎯 未来计划

- [ ] 添加更多失败案例数据
- [ ] 支持用户提交案例
- [ ] 添加案例对比功能
- [ ] 增加失败模式分析工具
- [ ] 支持多语言
- [ ] 添加RSS订阅
- [ ] 支持数据库存储（MongoDB/PostgreSQL）
- [ ] 实现增量更新
- [ ] 添加数据质量评分

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

MIT License

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者！

---

**创业坟场** - 记录失败，启迪未来 💀
