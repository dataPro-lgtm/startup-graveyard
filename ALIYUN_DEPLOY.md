# 阿里云ECS部署完整指南

> **注意**：如果你的服务器是 **CentOS 7**，请查看 [CENTOS7_DEPLOY.md](./CENTOS7_DEPLOY.md)

## 🚀 快速开始（Ubuntu/Debian）

### 步骤1: 连接到服务器

```bash
ssh root@your-server-ip
# 或使用密钥
ssh -i your-key.pem root@your-server-ip
```

### 步骤2: 一键安装和部署（Ubuntu/Debian）

```bash
# 安装Node.js和PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# 克隆项目
cd /var/www
git clone https://github.com/dataPro-lgtm/startup-graveyard.git
cd startup-graveyard

# 安装依赖
npm install --production

# 初始化数据
npm run init-data

# 构建项目
npm run build

# 启动应用
pm2 start npm --name "startup-graveyard" -- start
pm2 save
pm2 startup
```

### 步骤3: 配置防火墙

```bash
# 开放3000端口（如果直接访问）
sudo ufw allow 3000/tcp

# 或开放80/443端口（如果使用Nginx）
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 步骤4: 访问应用

- 直接访问：`http://your-server-ip:3000`
- 管理页面：`http://your-server-ip:3000/admin`

## 📋 详细配置

### 1. 环境变量配置

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

### 2. 配置Nginx反向代理（推荐）

```bash
# 安装Nginx
sudo apt-get install -y nginx

# 创建配置文件
sudo nano /etc/nginx/sites-available/startup-graveyard
```

粘贴以下内容（修改server_name）：
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
    }
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/startup-graveyard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 3. 配置SSL（HTTPS）

```bash
# 安装Certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d your-domain.com

# 自动续期测试
sudo certbot renew --dry-run
```

## 🔄 更新部署

```bash
cd /var/www/startup-graveyard
git pull
npm install --production
npm run build
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
```

### 查看应用日志

```bash
# PM2日志
pm2 logs startup-graveyard --lines 100

# Nginx访问日志
sudo tail -f /var/log/nginx/startup-graveyard-access.log

# Nginx错误日志
sudo tail -f /var/log/nginx/startup-graveyard-error.log
```

## 💾 数据备份

### 手动备份

```bash
# 备份数据文件
cp -r /var/www/startup-graveyard/data /var/backups/startup-graveyard-$(date +%Y%m%d)
```

### 自动备份（每天凌晨3点）

```bash
# 创建备份脚本
sudo nano /var/www/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/startup-graveyard"
mkdir -p $BACKUP_DIR
cp /var/www/startup-graveyard/data/*.json $BACKUP_DIR/backup_$DATE.json
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz $BACKUP_DIR/backup_$DATE.json
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete
```

```bash
chmod +x /var/www/backup.sh

# 添加到crontab
crontab -e
# 添加：0 3 * * * /var/www/backup.sh
```

## 🔒 安全建议

1. **修改SSH端口**（可选）
2. **使用SSH密钥认证**（推荐）
3. **配置防火墙规则**
4. **定期更新系统**
5. **使用HTTPS**
6. **设置强密码**

## 🐛 故障排查

### 应用无法启动

```bash
# 检查端口占用
sudo lsof -i :3000

# 查看PM2日志
pm2 logs startup-graveyard --err

# 检查环境变量
pm2 env startup-graveyard
```

### 无法访问

```bash
# 检查防火墙
sudo ufw status

# 检查Nginx
sudo nginx -t
sudo systemctl status nginx

# 检查PM2
pm2 status
```

### 性能问题

```bash
# 查看资源使用
pm2 monit
htop

# 查看Nginx访问日志
sudo tail -f /var/log/nginx/startup-graveyard-access.log
```

## 📞 需要帮助？

- 查看详细文档：[DEPLOY.md](./DEPLOY.md)
- 查看快速部署：[QUICK_DEPLOY.md](./QUICK_DEPLOY.md)
- 提交Issue到GitHub
