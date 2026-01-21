# Docker Hub 无法访问的解决方案

## 问题
服务器无法访问 `registry-1.docker.io`（Docker Hub），导致无法拉取镜像。

## 解决方案

### 方案1: 配置Docker镜像加速器（推荐）

在服务器上执行：

```bash
# 配置镜像源
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null << 'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com",
    "https://ccr.ccs.tencentyun.com"
  ]
}
EOF

# 重启Docker
sudo systemctl daemon-reload
sudo systemctl restart docker

# 测试
docker pull hello-world
```

然后使用修改后的docker-compose：

```bash
# 修改docker-compose.yml，使用Dockerfile.aliyun
# 或者直接使用：
docker compose -f docker-compose.aliyun.yml build
docker compose -f docker-compose.aliyun.yml up -d
```

### 方案2: 使用阿里云容器镜像服务

1. 登录阿里云控制台
2. 进入"容器镜像服务" -> "镜像加速器"
3. 获取你的专属加速地址
4. 配置到 `/etc/docker/daemon.json`

### 方案3: 离线部署（最可靠）

如果网络问题无法解决，使用离线部署：

#### 在本地（能访问Docker Hub的机器）：

```bash
cd /Users/zengdan/startup-graveyard

# 使用国内镜像源构建
docker build -f Dockerfile.aliyun -t startup-graveyard:latest .

# 导出镜像
docker save startup-graveyard:latest | gzip > startup-graveyard.tar.gz

# 上传到服务器
scp startup-graveyard.tar.gz root@47.96.3.44:/tmp/
```

#### 在服务器上：

```bash
# 导入镜像
gunzip -c /tmp/startup-graveyard.tar.gz | docker load

# 创建目录
mkdir -p /root/startup-graveyard/data
mkdir -p /root/startup-graveyard/logs

# 上传项目文件（除了node_modules和.next）
cd /root
tar -xzf /tmp/startup-graveyard.tar.gz  # 如果之前上传了项目文件

# 运行容器
docker run -d \
  --name startup-graveyard \
  -p 3000:3000 \
  -v /root/startup-graveyard/data:/app/data \
  -v /root/startup-graveyard/logs:/app/logs \
  --restart unless-stopped \
  startup-graveyard:latest

# 查看日志
docker logs -f startup-graveyard
```

### 方案4: 直接使用国内镜像源构建

修改 `docker-compose.yml`：

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.aliyun  # 使用这个Dockerfile
```

或者直接使用：

```bash
docker compose -f docker-compose.aliyun.yml build
docker compose -f docker-compose.aliyun.yml up -d
```

## 快速修复脚本

在服务器上执行：

```bash
cd /root/startup-graveyard
bash scripts/fix-docker-mirror.sh
```

然后重新构建：

```bash
docker compose -f docker-compose.aliyun.yml build
docker compose -f docker-compose.aliyun.yml up -d
```
