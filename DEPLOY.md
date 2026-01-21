# 阿里云部署指南

## 前置要求

- 阿里云ECS实例（推荐 Ubuntu 20.04+ 或 CentOS 7+）
- Node.js 20+ 已安装
- 域名（可选，用于访问）

## 部署步骤

### 1. 服务器准备

#### 连接到服务器
```bash
ssh root@your-server-ip
```

#### 安装 Node.js（如果未安装）
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

#### 安装 PM2（进程管理）
```bash
sudo npm install -g pm2
```

#### 安装 Nginx（可选，用于反向代理）
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y nginx

# CentOS/RHEL
sudo yum install -y nginx
```

### 2. 克隆项目

```bash
# 创建项目目录
mkdir -p /var/www
cd /var/www

# 克隆项目（替换为你的GitHub仓库地址）
git clone https://github.com/dataPro-lgtm/startup-graveyard.git
cd startup-graveyard

# 安装依赖
npm install --production
```

### 3. 配置环境变量

```bash
# 创建环境变量文件
cp .env.example .env
nano .env
```

编辑 `.env` 文件：
```env
# 生产环境
NODE_ENV=production

# API Keys (可选)
OPENAI_API_KEY=your_key_here
DEEPSEEK_API_KEY=your_key_here

# 采集API Token (可选)
COLLECT_API_TOKEN=your_secret_token_here

# 定时任务配置
CRON_SCHEDULE=0 2 * * *
```

### 4. 初始化数据

```bash
# 初始化默认数据
npm run init-data
```

### 5. 构建项目

```bash
# 构建生产版本
npm run build
```

### 6. 使用 PM2 启动

```bash
# 使用PM2启动
pm2 start npm --name "startup-graveyard" -- start

# 或者使用ecosystem文件
pm2 start ecosystem.config.js

# 保存PM2配置
pm2 save

# 设置开机自启
pm2 startup
```

### 7. 配置 Nginx 反向代理（可选）

创建Nginx配置：
```bash
sudo nano /etc/nginx/sites-available/startup-graveyard
```

配置内容：
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或IP

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

启用配置：
```bash
# Ubuntu/Debian
sudo ln -s /etc/nginx/sites-available/startup-graveyard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# CentOS/RHEL
sudo cp /etc/nginx/sites-available/startup-graveyard /etc/nginx/conf.d/
sudo nginx -t
sudo systemctl restart nginx
```

### 8. 配置防火墙

```bash
# Ubuntu/Debian (UFW)
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 常用命令

### PM2 管理
```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs startup-graveyard

# 重启
pm2 restart startup-graveyard

# 停止
pm2 stop startup-graveyard

# 删除
pm2 delete startup-graveyard
```

### 更新部署
```bash
cd /var/www/startup-graveyard
git pull
npm install --production
npm run build
pm2 restart startup-graveyard
```

## 监控和维护

### 查看应用日志
```bash
pm2 logs startup-graveyard --lines 100
```

### 查看系统资源
```bash
pm2 monit
```

### 设置定时备份数据
```bash
# 创建备份脚本
nano /var/www/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/startup-graveyard"
mkdir -p $BACKUP_DIR
cp /var/www/startup-graveyard/data/*.json $BACKUP_DIR/
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz $BACKUP_DIR/*.json
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete
```

```bash
chmod +x /var/www/backup.sh

# 添加到crontab（每天凌晨3点备份）
crontab -e
# 添加：0 3 * * * /var/www/backup.sh
```

## 故障排查

### 应用无法启动
1. 检查端口是否被占用：`lsof -i :3000`
2. 查看PM2日志：`pm2 logs startup-graveyard`
3. 检查环境变量：`pm2 env startup-graveyard`

### 无法访问
1. 检查防火墙规则
2. 检查Nginx配置：`sudo nginx -t`
3. 检查PM2状态：`pm2 status`

### 数据采集不工作
1. 检查网络连接
2. 查看采集记录：访问 `/admin` 页面
3. 检查API密钥配置

## 安全建议

1. **使用HTTPS**：配置SSL证书（Let's Encrypt免费）
2. **定期更新**：保持系统和依赖包更新
3. **备份数据**：定期备份 `data/*.json` 文件
4. **限制访问**：配置防火墙规则
5. **使用强密码**：设置强密码和SSH密钥认证

## SSL证书配置（Let's Encrypt）

```bash
# 安装Certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

## 性能优化

1. **启用Gzip压缩**（在Nginx配置中）
2. **使用CDN**（可选）
3. **数据库优化**（如果使用数据库）
4. **缓存策略**（Next.js自动处理）
