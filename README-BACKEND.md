# 后端数据采集系统

## 功能概述

自动数据采集系统支持从多个数据源采集创业失败案例，并进行数据清洗、去重、标准化处理。

## 架构设计

### 1. 数据采集器 (Collectors)

- **BaseCollector**: 基础采集器抽象类
- **WebCollector**: 网页爬虫采集器
- **AICollector**: AI增强采集器（需要API密钥）
- **ManualCollector**: 手动数据源采集器

### 2. 数据处理 (DataProcessor)

- 数据清洗：去除无效数据、标准化格式
- 数据验证：验证数据完整性和有效性
- 去重：基于名称和年份去重
- 数据增强：补充缺失信息、生成标签

### 3. 数据存储 (Database)

- JSON文件存储（可升级到数据库）
- 采集记录追踪
- 数据CRUD操作

### 4. 定时任务 (Cron)

- 使用node-cron实现定时采集
- 默认每天凌晨2点执行
- 支持自定义cron表达式

## API接口

### 手动采集
```bash
POST /api/collect
Authorization: Bearer {COLLECT_API_TOKEN}
```

### 获取采集记录
```bash
GET /api/collections
```

### 定时任务管理
```bash
# 启动/停止定时任务
POST /api/cron
Body: { "action": "start" | "stop", "schedule": "0 2 * * *" }

# 获取定时任务状态
GET /api/cron/status
```

## 使用方式

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量（可选）
```bash
cp .env.example .env
# 编辑.env文件，填入API密钥等
```

### 3. 初始化数据
```bash
# 首次运行会自动从startups.ts导入默认数据
npm run dev
```

### 4. 手动触发采集
访问管理页面：`http://localhost:3000/admin`

或使用API：
```bash
curl -X POST http://localhost:3000/api/collect \
  -H "Authorization: Bearer your_token"
```

### 5. 启动定时任务
在管理页面点击"启动定时任务"，或使用API：
```bash
curl -X POST http://localhost:3000/api/cron \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'
```

## 数据源配置

### WebCollector
在 `lib/collectors/webCollector.ts` 中配置：
- 数据源URL
- CSS选择器
- 解析逻辑

### AICollector
需要配置API密钥：
- OpenAI API Key
- 或 DeepSeek API Key

### ManualCollector
可以集成：
- IT桔子API
- Crunchbase API
- RSS源
- 其他公开API

## 数据格式

采集的数据会被标准化为 `Startup` 类型：

```typescript
{
  id: string;
  name: string;
  nameEn?: string;
  industry: string;
  foundedYear: number;
  closedYear: number;
  lifespan: number;
  totalFunding: number;
  lossAmount: number;
  investors: string[];
  founders: string[];
  failureReasons: string[];
  description: string;
  detailedAnalysis: string;
  lessons: string[];
  tags: string[];
  country: string;
  website?: string;
}
```

## 扩展开发

### 添加新的采集器

1. 创建新的采集器类，继承 `BaseCollector`
2. 实现 `collect()` 方法
3. 在 `CollectorManager` 中注册

```typescript
class MyCollector extends BaseCollector {
  async collect(): Promise<Startup[]> {
    // 实现采集逻辑
  }
}
```

### 添加新的数据源

在对应的采集器中添加数据源配置：

```typescript
private sources = [
  {
    name: '数据源名称',
    url: '数据源URL',
    // ... 其他配置
  }
];
```

## 注意事项

1. **API限制**: 注意遵守各数据源的API使用限制和robots.txt
2. **数据质量**: 采集的数据需要人工审核和补充
3. **性能**: 大量数据采集时注意性能优化
4. **错误处理**: 采集失败不会影响系统运行
5. **数据备份**: 定期备份 `data/startups.json` 文件

## 未来改进

- [ ] 支持数据库存储（MongoDB/PostgreSQL）
- [ ] 添加更多数据源
- [ ] 实现增量更新
- [ ] 添加数据质量评分
- [ ] 实现数据导出功能
- [ ] 添加采集任务队列
- [ ] 实现分布式采集
