# Docker 部署指南（CentOS 7.9）

使用 Docker 部署可以避免环境依赖问题，更简单可靠。

## 🚀 快速部署

### 步骤1: 安装 Docker 和 Docker Compose

```bash
# 连接到服务器
ssh root@your-server-ip

# 安装 Docker
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install -y docker-ce docker-ce-cli containerd.io

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证安装
docker --version
docker-compose --version
```

### 步骤2: 克隆项目

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/dataPro-lgtm/startup-graveyard.git
cd startup-graveyard
```

### 步骤3: 配置环境变量（可选）

```bash
# 创建环境变量文件
cp .env.production.example .env
nano .env
```

### 步骤4: 使用 Docker Compose 部署

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 查看状态
docker-compose ps
```

### 步骤5: 配置防火墙

```bash
# CentOS 7 使用 firewalld
sudo systemctl start firewalld
sudo systemctl enable firewalld
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### 访问应用

- 应用地址：`http://your-server-ip:3000`
- 管理页面：`http://your-server-ip:3000/admin`

## 📋 常用命令

### Docker Compose 命令

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看日志
docker-compose logs -f app

# 查看状态
docker-compose ps

# 进入容器
docker-compose exec app sh

# 重新构建
docker-compose build --no-cache
docker-compose up -d
```

### Docker 命令

```bash
# 查看容器
docker ps

# 查看日志
docker logs startup-graveyard

# 查看容器详细信息
docker inspect startup-graveyard

# 进入容器
docker exec -it startup-graveyard sh

# 停止容器
docker stop startup-graveyard

# 启动容器
docker start startup-graveyard

# 删除容器
docker rm startup-graveyard
```

## 🔄 更新部署

```bash
cd /var/www/startup-graveyard

# 拉取最新代码
git pull

# 重新构建并启动
docker-compose build --no-cache
docker-compose up -d

# 或者使用更新脚本
bash scripts/docker-update.sh
```

## 🔧 配置 Nginx 反向代理（可选）

### 安装 Nginx

```bash
sudo yum install -y epel-release
sudo yum install -y nginx
```

### 配置 Nginx

```bash
sudo nano /etc/nginx/conf.d/startup-graveyard.conf
```

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 改为你的域名或IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

## 💾 数据持久化

数据文件会自动挂载到 `./data` 目录，确保数据不会丢失。

### 备份数据

```bash
# 手动备份
cp -r /var/www/startup-graveyard/data /var/backups/startup-graveyard-$(date +%Y%m%d)

# 或使用备份脚本
bash scripts/docker-backup.sh
```

## 🐛 故障排查

### 容器无法启动

```bash
# 查看日志
docker-compose logs app

# 查看容器状态
docker-compose ps

# 检查端口占用
sudo netstat -tlnp | grep 3000
```

### 无法访问

```bash
# 检查防火墙
sudo firewall-cmd --list-all

# 检查容器是否运行
docker ps | grep startup-graveyard

# 检查端口映射
docker port startup-graveyard
```

### 查看应用日志

```bash
# Docker Compose 日志
docker-compose logs -f app

# 或直接查看容器日志
docker logs -f startup-graveyard
```

## 🔒 安全建议

1. **不要暴露 Docker 端口**：使用 Nginx 反向代理
2. **定期更新镜像**：`docker-compose pull`
3. **备份数据**：定期备份 `data` 目录
4. **限制资源**：在 docker-compose.yml 中添加资源限制

## 📊 监控

```bash
# 查看容器资源使用
docker stats startup-graveyard

# 查看容器详细信息
docker inspect startup-graveyard
```

## 🎯 生产环境优化

### 添加资源限制

编辑 `docker-compose.yml`：

```yaml
services:
  app:
    # ... 其他配置
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### 使用健康检查

已在 docker-compose.yml 中配置健康检查。

## 📝 环境变量

可以通过 `.env` 文件或 docker-compose.yml 设置环境变量：

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
  - OPENAI_API_KEY=your_key
```

## 🚀 一键部署脚本

```bash
# 使用部署脚本
bash scripts/docker-deploy.sh
```
