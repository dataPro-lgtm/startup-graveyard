# 快速部署指南（阿里云）

> **CentOS 7用户请查看**: [CENTOS7_DEPLOY.md](./CENTOS7_DEPLOY.md)

## 一键部署命令（Ubuntu/Debian）

在服务器上执行以下命令：

```bash
# 1. 安装Node.js和PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# 2. 克隆项目
cd /var/www
git clone https://github.com/dataPro-lgtm/startup-graveyard.git
cd startup-graveyard

# 3. 安装依赖并部署
npm install --production
npm run init-data
npm run build
npm run deploy
```

## 配置Nginx（可选）

```bash
# 安装Nginx
sudo apt-get install -y nginx

# 复制配置文件
sudo cp nginx.conf.example /etc/nginx/sites-available/startup-graveyard
sudo nano /etc/nginx/sites-available/startup-graveyard
# 修改 server_name 为你的域名或IP

# 启用配置
sudo ln -s /etc/nginx/sites-available/startup-graveyard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 访问应用

- 直接访问：`http://your-server-ip:3000`
- 通过Nginx：`http://your-domain.com` 或 `http://your-server-ip`

## 更新应用

```bash
cd /var/www/startup-graveyard
npm run update
```

## 查看日志

```bash
# PM2日志
pm2 logs startup-graveyard

# Nginx日志
sudo tail -f /var/log/nginx/startup-graveyard-access.log
```

## 常用命令

```bash
# 查看应用状态
pm2 status

# 重启应用
pm2 restart startup-graveyard

# 停止应用
pm2 stop startup-graveyard

# 查看资源使用
pm2 monit
```
