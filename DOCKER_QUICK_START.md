# Docker 快速部署（CentOS 7.9）

## 🚀 5分钟快速部署

### 1. 安装 Docker（如果未安装）

```bash
# 安装Docker
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install -y docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo systemctl enable docker

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证
docker --version
docker-compose --version
```

### 2. 克隆项目

```bash
cd /var/www
git clone https://github.com/dataPro-lgtm/startup-graveyard.git
cd startup-graveyard
```

### 3. 一键部署

```bash
# 使用部署脚本
bash scripts/docker-deploy.sh

# 或手动部署
docker-compose up -d
```

### 4. 配置防火墙

```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### 5. 访问应用

- 应用：`http://your-server-ip:3000`
- 管理：`http://your-server-ip:3000/admin`

## 📋 常用命令

```bash
# 查看日志
docker-compose logs -f

# 重启
docker-compose restart

# 停止
docker-compose down

# 更新
git pull && docker-compose build && docker-compose up -d

# 查看状态
docker-compose ps
```

## 🔄 更新应用

```bash
cd /var/www/startup-graveyard
bash scripts/docker-update.sh
```

## 💾 备份数据

```bash
bash scripts/docker-backup.sh
```

## 🐛 故障排查

```bash
# 查看日志
docker-compose logs app

# 进入容器
docker-compose exec app sh

# 重启容器
docker-compose restart
```
