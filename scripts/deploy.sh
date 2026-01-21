#!/bin/bash

# 部署脚本
# 使用方法: ./scripts/deploy.sh

set -e

echo "🚀 开始部署..."

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js 未安装${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js 版本: $(node -v)${NC}"

# 检查PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠ PM2 未安装，正在安装...${NC}"
    npm install -g pm2
fi

echo -e "${GREEN}✓ PM2 已安装${NC}"

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
    pm2 start ecosystem.config.js || pm2 start npm --name "startup-graveyard" -- start
fi

# 保存PM2配置
pm2 save

echo -e "${GREEN}✅ 部署完成！${NC}"
echo ""
echo "📊 应用状态:"
pm2 status startup-graveyard

echo ""
echo "📝 查看日志: pm2 logs startup-graveyard"
echo "🔄 重启应用: pm2 restart startup-graveyard"
echo "⏹️  停止应用: pm2 stop startup-graveyard"
