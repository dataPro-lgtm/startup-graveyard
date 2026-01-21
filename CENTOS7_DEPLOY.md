# CentOS 7 部署指南（阿里云）

## 🚀 快速部署（CentOS 7）

### 步骤1: 连接到服务器

```bash
ssh root@your-server-ip
# 或使用密钥
ssh -i your-key.pem root@your-server-ip
```

### 步骤2: 安装Node.js

**重要**：CentOS 7 的 glibc 版本较旧，Node.js 20 不兼容。请使用 Node.js 18 或 NVM。

#### 方法A: 使用 NVM（推荐，最简单）

```bash
# 安装 NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 加载 NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 安装 Node.js 18（兼容 CentOS 7）
nvm install 18
nvm use 18
nvm alias default 18

# 永久设置（添加到 ~/.bashrc）
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> ~/.bashrc

# 验证安装
node -v  # 应该显示 v18.x.x
npm -v
```

#### 方法B: 使用 Node.js 18 RPM 源

```bash
# 使用 Node.js 18（兼容 CentOS 7）
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 验证安装
node -v
npm -v
```

> **注意**：如果遇到依赖问题，请使用 NVM 方法（方法A）

### 步骤3: 安装PM2

```bash
sudo npm install -g pm2
```

### 步骤4: 安装Git（如果未安装）

```bash
sudo yum install -y git
```

### 步骤5: 克隆项目

```bash
# 创建项目目录
mkdir -p /var/www
cd /var/www

# 克隆项目
git clone https://github.com/dataPro-lgtm/startup-graveyard.git
cd startup-graveyard
```

### 步骤6: 安装依赖并构建

```bash
# 安装依赖
npm install --production

# 初始化数据
npm run init-data

# 构建项目
npm run build
```

### 步骤7: 启动应用

```bash
# 使用PM2启动
pm2 start npm --name "startup-graveyard" -- start

# 保存PM2配置
pm2 save

# 设置开机自启
pm2 startup systemd -u root --hp /root
# 执行上面命令输出的命令（类似：sudo env PATH=...）
```

### 步骤8: 配置防火墙

```bash
# CentOS 7 使用firewalld
sudo systemctl start firewalld
sudo systemctl enable firewalld

# 开放端口
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

# 查看防火墙状态
sudo firewall-cmd --list-all
```

### 步骤9: 访问应用

- 直接访问：`http://your-server-ip:3000`
- 管理页面：`http://your-server-ip:3000/admin`

## 📋 配置Nginx反向代理（推荐）

### 安装Nginx

```bash
# CentOS 7 EPEL仓库
sudo yum install -y epel-release
sudo yum install -y nginx

# 启动Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 配置Nginx

```bash
# 创建配置文件
sudo nano /etc/nginx/conf.d/startup-graveyard.conf
```

粘贴以下内容（修改server_name）：
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 改为你的域名或IP

    access_log /var/log/nginx/startup-graveyard-access.log;
    error_log /var/log/nginx/startup-graveyard-error.log;

    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;

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
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态文件缓存
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, immutable";
    }
}
```

测试并重启Nginx：
```bash
# 测试配置
sudo nginx -t

# 重启Nginx
sudo systemctl restart nginx
```

### 配置防火墙（Nginx）

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 🔒 配置SSL（HTTPS）

### 安装Certbot

```bash
# 安装EPEL和Certbot
sudo yum install -y epel-release
sudo yum install -y certbot python3-certbot-nginx
```

### 获取SSL证书

```bash
sudo certbot --nginx -d your-domain.com
```

### 自动续期

```bash
# 测试续期
sudo certbot renew --dry-run

# Certbot会自动配置cron任务
```

## 🔄 更新应用

```bash
cd /var/www/startup-graveyard

# 备份数据
cp -r data /var/backups/startup-graveyard-$(date +%Y%m%d)

# 拉取最新代码
git pull

# 安装依赖
npm install --production

# 构建
npm run build

# 重启应用
pm2 restart startup-graveyard
```

或使用更新脚本：
```bash
npm run update
```

## 📊 监控和管理

### PM2命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs startup-graveyard

# 实时监控
pm2 monit

# 重启
pm2 restart startup-graveyard

# 停止
pm2 stop startup-graveyard

# 查看详细信息
pm2 info startup-graveyard
```

### 系统服务管理

```bash
# 查看PM2服务状态
sudo systemctl status pm2-root

# 查看Nginx状态
sudo systemctl status nginx

# 重启Nginx
sudo systemctl restart nginx
```

### 查看日志

```bash
# PM2日志
pm2 logs startup-graveyard --lines 100

# Nginx访问日志
sudo tail -f /var/log/nginx/startup-graveyard-access.log

# Nginx错误日志
sudo tail -f /var/log/nginx/startup-graveyard-error.log

# 系统日志
sudo journalctl -u nginx -f
```

## 💾 数据备份

### 手动备份

```bash
# 创建备份目录
mkdir -p /var/backups/startup-graveyard

# 备份数据
cp -r /var/www/startup-graveyard/data /var/backups/startup-graveyard/data-$(date +%Y%m%d_%H%M%S)
```

### 自动备份（使用cron）

```bash
# 创建备份脚本
sudo nano /var/www/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/startup-graveyard"
mkdir -p $BACKUP_DIR
cp /var/www/startup-graveyard/data/*.json $BACKUP_DIR/backup_$DATE.json 2>/dev/null || true
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz $BACKUP_DIR/backup_$DATE.json 2>/dev/null || true
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete
```

```bash
chmod +x /var/www/backup.sh

# 添加到crontab（每天凌晨3点备份）
crontab -e
# 添加：0 3 * * * /var/www/backup.sh
```

## 🐛 故障排查

### 应用无法启动

```bash
# 检查端口占用
sudo netstat -tlnp | grep 3000
# 或
sudo ss -tlnp | grep 3000

# 查看PM2日志
pm2 logs startup-graveyard --err

# 检查环境变量
pm2 env startup-graveyard

# 检查Node.js版本
node -v
```

### 无法访问

```bash
# 检查防火墙
sudo firewall-cmd --list-all

# 检查Nginx配置
sudo nginx -t

# 检查Nginx状态
sudo systemctl status nginx

# 检查PM2状态
pm2 status
```

### 权限问题

```bash
# 如果遇到权限问题，检查文件权限
ls -la /var/www/startup-graveyard

# 修改所有者（如果需要）
sudo chown -R $USER:$USER /var/www/startup-graveyard
```

### SELinux问题（如果启用）

```bash
# 检查SELinux状态
getenforce

# 如果启用，可能需要设置上下文
sudo setsebool -P httpd_can_network_connect 1
```

## 🔧 环境变量配置

```bash
cd /var/www/startup-graveyard
cp .env.production.example .env
nano .env
```

编辑 `.env` 文件：
```env
NODE_ENV=production
PORT=3000
# 其他配置...
```

## 📝 一键部署脚本（CentOS 7）

创建部署脚本：
```bash
sudo nano /var/www/deploy.sh
```

```bash
#!/bin/bash
set -e

echo "🚀 开始部署..."

# 安装Node.js
if ! command -v node &> /dev/null; then
    echo "安装Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
fi

# 安装PM2
if ! command -v pm2 &> /dev/null; then
    echo "安装PM2..."
    sudo npm install -g pm2
fi

# 安装Git
if ! command -v git &> /dev/null; then
    echo "安装Git..."
    sudo yum install -y git
fi

# 进入项目目录
cd /var/www/startup-graveyard

# 安装依赖
echo "安装依赖..."
npm install --production

# 初始化数据
if [ ! -f "data/startups.json" ] || [ "$(cat data/startups.json | jq 'length' 2>/dev/null || echo 0)" = "0" ]; then
    echo "初始化数据..."
    npm run init-data || node scripts/init-data.mjs
fi

# 构建项目
echo "构建项目..."
npm run build

# 启动应用
if pm2 list | grep -q "startup-graveyard"; then
    echo "重启应用..."
    pm2 restart startup-graveyard
else
    echo "启动应用..."
    pm2 start npm --name "startup-graveyard" -- start
    pm2 save
fi

# 配置防火墙
echo "配置防火墙..."
sudo firewall-cmd --permanent --add-port=3000/tcp 2>/dev/null || true
sudo firewall-cmd --reload 2>/dev/null || true

echo "✅ 部署完成！"
pm2 status startup-graveyard
```

```bash
chmod +x /var/www/deploy.sh
```

## 🎯 常用命令总结

```bash
# 查看应用状态
pm2 status

# 查看日志
pm2 logs startup-graveyard

# 重启应用
pm2 restart startup-graveyard

# 更新应用
cd /var/www/startup-graveyard && git pull && npm install --production && npm run build && pm2 restart startup-graveyard

# 查看系统资源
pm2 monit
htop

# 查看防火墙规则
sudo firewall-cmd --list-all
```

## ⚠️ 注意事项

1. **CentOS 7默认使用firewalld**，不是ufw
2. **Nginx配置文件位置**：`/etc/nginx/conf.d/` 而不是 `sites-available`
3. **系统服务管理**：使用 `systemctl` 而不是 `service`
4. **包管理器**：使用 `yum` 而不是 `apt-get`
5. **SELinux**：如果启用，可能需要额外配置

## 📞 需要帮助？

- 查看详细文档：[DEPLOY.md](./DEPLOY.md)
- 提交Issue到GitHub
