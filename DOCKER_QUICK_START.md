# Docker 快速部署（通用）

## 🚀 3 步跑起来

### 1. 安装 Docker / Docker Compose

不同系统略有差异，大致就是：

```bash
# 查看版本（确认已安装）
docker --version
docker compose version  # 或 docker-compose --version
```

如果没有安装，按你所在发行版官方文档装一遍即可。

### 2. 获取项目代码

```bash
git clone https://github.com/dataPro-lgtm/startup-graveyard.git
cd startup-graveyard
```

### 3. 构建并启动

```bash
# 构建镜像
docker compose build

# 启动（后台运行）
docker compose up -d
```

默认会监听 `3000` 端口：

- 应用：`http://your-server-ip:3000`
- 管理：`http://your-server-ip:3000/admin`

## 📋 常用命令

```bash
# 查看日志
docker compose logs -f

# 重启
docker compose restart

# 停止
docker compose down

# 更新代码 + 重新部署
git pull
docker compose build
docker compose up -d

# 查看状态
docker compose ps
```

## 💾 数据持久化

`docker-compose.yml` 已经把容器内 `/app/data`、`/app/logs` 挂载到当前目录：

- `./data`：案例数据（`startups.json` 等）
- `./logs`：日志（可选）

备份数据很简单：

```bash
tar czf startup-graveyard-data-backup.tgz data logs
```

## 🐛 简单故障排查

```bash
# 查看日志
docker compose logs app

# 进入容器
docker compose exec app sh

# 检查容器是否在跑
docker compose ps

# 查看 3000 端口映射
docker ps
```
