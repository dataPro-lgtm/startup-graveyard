# Docker 部署故障排查

## "文本文件忙"错误

### 问题
```
/usr/local/bin/docker-compose: 文本文件忙
```

### 原因
1. 文件正在被其他进程使用
2. 文件系统问题（NFS等）
3. 文件权限问题

### 解决方案

#### 方案1: 使用Docker Compose插件（推荐）

新版本的Docker已经内置了Compose插件，不需要单独安装：

```bash
# 直接使用 docker compose（注意是空格，不是横线）
docker compose build
docker compose up -d
docker compose ps
```

#### 方案2: 重新安装docker-compose

```bash
# 删除旧文件
sudo rm -f /usr/local/bin/docker-compose

# 重新下载
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证
docker-compose --version
```

#### 方案3: 使用pip安装

```bash
sudo yum install -y python3-pip
sudo pip3 install docker-compose

# 验证
docker-compose --version
```

#### 方案4: 使用修复脚本

```bash
bash scripts/docker-deploy-fix.sh
```

## 直接使用Docker命令（不依赖docker-compose）

如果docker-compose一直有问题，可以直接使用docker命令：

```bash
# 构建镜像
docker build -f Dockerfile.simple -t startup-graveyard:latest .

# 运行容器
docker run -d \
  --name startup-graveyard \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  startup-graveyard:latest

# 查看日志
docker logs -f startup-graveyard

# 停止
docker stop startup-graveyard

# 删除
docker rm startup-graveyard
```

## 其他常见问题

### 端口被占用

```bash
# 检查端口
sudo netstat -tlnp | grep 3000

# 停止占用端口的进程
sudo kill -9 <PID>
```

### 权限问题

```bash
# 确保数据目录有写权限
sudo chown -R $USER:$USER data/
chmod -R 755 data/
```

### 镜像构建失败

```bash
# 清理Docker缓存
docker system prune -a

# 重新构建（不使用缓存）
docker-compose build --no-cache
```
