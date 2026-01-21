#!/bin/bash

# Docker 更新脚本
# 使用方法: bash scripts/docker-update.sh

set -e

echo "🔄 更新Docker部署..."

# 备份数据
echo "💾 备份数据..."
BACKUP_DIR="/var/backups/startup-graveyard"
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
cp -r data $BACKUP_DIR/data-$DATE 2>/dev/null || true

# 拉取最新代码
echo "📥 拉取最新代码..."
git pull

# 重新构建
echo "🔨 重新构建镜像..."
docker-compose build --no-cache

# 重启容器
echo "🔄 重启容器..."
docker-compose down
docker-compose up -d

# 等待启动
sleep 5

# 检查状态
if docker ps | grep -q "startup-graveyard"; then
    echo "✅ 更新完成！"
    docker-compose ps
else
    echo "❌ 更新失败，查看日志: docker-compose logs"
    exit 1
fi
