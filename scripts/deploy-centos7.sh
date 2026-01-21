#!/bin/bash

# CentOS 7 部署脚本
# 使用方法: ./scripts/deploy-centos7.sh

set -e

echo "🚀 开始部署（CentOS 7）..."

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}⚠ 建议使用root用户运行此脚本${NC}"
fi

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js 未安装${NC}"
    echo -e "${YELLOW}CentOS 7 需要使用 Node.js 18（Node.js 20 不兼容）${NC}"
    echo -e "${YELLOW}请先运行: bash scripts/install-nodejs-centos7.sh${NC}"
    echo -e "${YELLOW}或手动安装:${NC}"
    echo -e "${YELLOW}  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash${NC}"
    echo -e "${YELLOW}  source ~/.bashrc${NC}"
    echo -e "${YELLOW}  nvm install 18${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js 版本: $(node -v)${NC}"

# 检查PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}安装PM2...${NC}"
    sudo npm install -g pm2
fi

echo -e "${GREEN}✓ PM2 已安装${NC}"

# 检查Git
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}安装Git...${NC}"
    sudo yum install -y git
fi

echo -e "${GREEN}✓ Git 已安装${NC}"

# 安装依赖
echo "📦 安装依赖..."
npm install --production

# 初始化数据（如果数据文件为空）
if [ ! -f "data/startups.json" ] || [ "$(cat data/startups.json | jq 'length' 2>/dev/null || echo 0)" = "0" ]; then
    echo "📊 初始化数据..."
    npm run init-data || node scripts/init-data.mjs
fi

# 构建项目
echo "🔨 构建项目..."
npm run build

# 检查PM2进程
if pm2 list | grep -q "startup-graveyard"; then
    echo "🔄 重启应用..."
    pm2 restart startup-graveyard
else
    echo "▶️  启动应用..."
    pm2 start npm --name "startup-graveyard" -- start
    pm2 save
fi

# 配置防火墙（firewalld）
echo "🔥 配置防火墙..."
if systemctl is-active --quiet firewalld; then
    sudo firewall-cmd --permanent --add-port=3000/tcp 2>/dev/null || true
    sudo firewall-cmd --reload 2>/dev/null || true
    echo -e "${GREEN}✓ 防火墙已配置${NC}"
else
    echo -e "${YELLOW}⚠ firewalld未运行，跳过防火墙配置${NC}"
fi

echo -e "${GREEN}✅ 部署完成！${NC}"
echo ""
echo "📊 应用状态:"
pm2 status startup-graveyard

echo ""
echo "📝 查看日志: pm2 logs startup-graveyard"
echo "🔄 重启应用: pm2 restart startup-graveyard"
echo "⏹️  停止应用: pm2 stop startup-graveyard"
echo ""
echo "💡 提示: 如果使用Nginx，请配置反向代理"
