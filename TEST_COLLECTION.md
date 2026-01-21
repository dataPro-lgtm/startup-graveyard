# 数据采集功能测试指南

## 测试方法

### 1. 手动测试（通过浏览器）

1. **启动开发服务器**
   ```bash
   npm run dev
   ```

2. **访问管理页面**
   打开浏览器访问：`http://localhost:3000/admin`

3. **测试手动采集**
   - 点击"开始采集"按钮
   - 查看采集结果和统计信息
   - 检查采集记录

4. **测试定时任务**
   - 点击"启动定时任务"按钮
   - 检查定时任务状态
   - 查看定时任务是否正常运行

### 2. 命令行测试

#### 测试采集功能
```bash
npm run test:collection
```

#### 测试API端点
```bash
# 确保开发服务器正在运行
npm run dev

# 在另一个终端运行
npm run test:api
```

#### 测试定时任务
```bash
npm run test:cron
```

### 3. 直接API测试

#### 测试采集端点
```bash
# 测试端点（不需要认证）
curl http://localhost:3000/api/collect/test

# 正式端点（可能需要认证）
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json"
```

#### 查看采集记录
```bash
curl http://localhost:3000/api/collections
```

#### 查看采集器状态
```bash
curl http://localhost:3000/api/collect/status
```

#### 管理定时任务
```bash
# 查看定时任务状态
curl http://localhost:3000/api/cron/status

# 启动定时任务
curl -X POST http://localhost:3000/api/cron \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'

# 停止定时任务
curl -X POST http://localhost:3000/api/cron \
  -H "Content-Type: application/json" \
  -d '{"action": "stop"}'
```

## 预期结果

### 手动采集测试
- ✅ 采集按钮可以正常点击
- ✅ 采集过程有loading状态
- ✅ 采集完成后显示结果统计
- ✅ 采集记录正确保存到 `data/collections.json`
- ✅ 新采集的数据保存到 `data/startups.json`

### 定时任务测试
- ✅ 可以启动定时任务
- ✅ 可以停止定时任务
- ✅ 定时任务状态正确显示
- ✅ 定时任务按设定时间执行（需要等待）

### API测试
- ✅ 所有API端点返回正确的JSON响应
- ✅ 错误处理正确
- ✅ 数据格式正确

## 注意事项

1. **网络访问**
   - WebCollector需要网络访问才能采集网页数据
   - 某些网站可能有反爬虫机制

2. **API密钥**
   - AICollector需要配置API密钥才能工作
   - 如果没有配置，会自动跳过

3. **数据去重**
   - 系统会自动去重，相同名称和年份的案例不会重复添加

4. **数据验证**
   - 采集的数据会经过验证和清洗
   - 无效数据会被过滤

## 故障排查

### 采集没有数据
- 检查网络连接
- 检查数据源是否可访问
- 查看控制台日志
- 检查 `data/collections.json` 中的错误记录

### API返回错误
- 检查开发服务器是否运行
- 查看服务器日志
- 检查API路由是否正确

### 定时任务不执行
- 检查定时任务是否已启动
- 检查cron表达式是否正确
- 查看服务器日志
