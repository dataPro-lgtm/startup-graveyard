#!/bin/bash

# 更新部署脚本
# 使用方法: ./scripts/update.sh

set -e

echo "🔄 开始更新..."

# 备份数据
echo "💾 备份数据..."
BACKUP_DIR="/var/backups/startup-graveyard"
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
cp data/*.json $BACKUP_DIR/backup_$DATE.json 2>/dev/null || true

# 拉取最新代码
echo "📥 拉取最新代码..."
git pull

# 安装依赖
echo "📦 安装依赖..."
npm install --production

# 构建项目
echo "🔨 构建项目..."
npm run build

# 重启应用
echo "🔄 重启应用..."
pm2 restart startup-graveyard

echo "✅ 更新完成！"
