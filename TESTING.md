# 数据采集功能测试指南

## 测试方法

### 方法1: 通过浏览器界面测试（推荐）

1. **启动开发服务器**
   ```bash
   npm run dev
   ```

2. **访问管理页面**
   打开浏览器访问：`http://localhost:3000/admin`

3. **测试手动采集**
   - 点击"开始采集"按钮
   - 观察采集过程（会有loading状态）
   - 查看采集结果提示
   - 页面会自动刷新显示最新数据

4. **查看采集记录**
   - 在管理页面查看"最近采集记录"
   - 查看"每日采集统计"
   - 检查采集是否成功

5. **测试定时任务**
   - 点击"启动定时任务"按钮
   - 查看定时任务状态（应显示"定时任务运行中"）
   - 点击"停止定时任务"可以停止

### 方法2: 通过API测试

#### 测试采集端点（最简单）
```bash
# 测试端点（不需要认证）
curl http://localhost:3000/api/collect/test
```

#### 查看采集记录
```bash
curl http://localhost:3000/api/collections | jq
```

#### 查看采集器状态
```bash
curl http://localhost:3000/api/collect/status | jq
```

#### 查看定时任务状态
```bash
curl http://localhost:3000/api/cron/status | jq
```

#### 启动/停止定时任务
```bash
# 启动
curl -X POST http://localhost:3000/api/cron \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}' | jq

# 停止
curl -X POST http://localhost:3000/api/cron \
  -H "Content-Type: application/json" \
  -d '{"action": "stop"}' | jq
```

## 测试检查清单

### ✅ 手动采集测试

- [ ] 访问 `/admin` 页面可以正常打开
- [ ] 点击"开始采集"按钮有响应
- [ ] 采集过程中显示loading状态
- [ ] 采集完成后显示结果统计
- [ ] 采集记录正确保存（检查 `data/collections.json`）
- [ ] 新数据正确保存（检查 `data/startups.json`）
- [ ] 首页数据自动更新

### ✅ 定时任务测试

- [ ] 可以启动定时任务
- [ ] 启动后状态显示"运行中"
- [ ] 可以停止定时任务
- [ ] 停止后状态正确更新
- [ ] 定时任务按设定时间执行（需要等待到执行时间）

### ✅ API端点测试

- [ ] `GET /api/collect/test` 返回成功响应
- [ ] `GET /api/collections` 返回采集记录
- [ ] `GET /api/collect/status` 返回采集器状态
- [ ] `GET /api/cron/status` 返回定时任务状态
- [ ] `POST /api/cron` 可以启动/停止定时任务

## 预期结果

### 手动采集
- 采集按钮点击后，会在控制台看到采集日志
- 采集完成后，`data/collections.json` 会增加新记录
- 如果采集到新数据，`data/startups.json` 会增加新案例
- 首页会自动刷新显示最新数据

### 定时任务
- 启动后，定时任务会在每天凌晨2点执行
- 执行时会自动采集数据
- 执行记录会保存到 `data/collections.json`

## 常见问题

### Q: 采集没有数据？
**A:** 可能的原因：
- WebCollector需要网络访问，某些网站可能有反爬虫
- AICollector需要API密钥
- ManualCollector需要配置API密钥
- 检查控制台日志查看具体错误

### Q: API返回401错误？
**A:** 使用 `/api/collect/test` 端点，不需要认证

### Q: 定时任务不执行？
**A:** 
- 检查定时任务是否已启动
- 默认是每天凌晨2点执行，需要等待
- 可以修改cron表达式进行测试（如每分钟执行）

### Q: 数据没有更新？
**A:**
- 检查 `data/startups.json` 文件是否更新
- 刷新浏览器页面
- 检查浏览器控制台是否有错误

## 快速测试步骤

1. **启动服务器**
   ```bash
   npm run dev
   ```

2. **打开管理页面**
   访问 `http://localhost:3000/admin`

3. **执行手动采集**
   点击"开始采集"按钮

4. **检查结果**
   - 查看采集结果提示
   - 检查首页数据是否更新
   - 查看 `data/collections.json` 文件

5. **测试定时任务**
   - 点击"启动定时任务"
   - 检查状态显示

## 调试技巧

1. **查看服务器日志**
   在运行 `npm run dev` 的终端查看日志输出

2. **检查数据文件**
   ```bash
   # 查看案例数据
   cat data/startups.json | jq 'length'
   
   # 查看采集记录
   cat data/collections.json | jq
   ```

3. **浏览器开发者工具**
   - 打开Network标签查看API请求
   - 查看Console标签查看错误信息
