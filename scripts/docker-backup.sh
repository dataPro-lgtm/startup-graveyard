#!/bin/bash

# Docker 数据备份脚本
# 使用方法: bash scripts/docker-backup.sh

BACKUP_DIR="/var/backups/startup-graveyard"
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)

echo "💾 备份数据..."

# 备份数据文件
if [ -d "data" ]; then
    tar -czf $BACKUP_DIR/backup_$DATE.tar.gz data/
    echo "✅ 备份完成: $BACKUP_DIR/backup_$DATE.tar.gz"
    
    # 删除7天前的备份
    find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete
    echo "🧹 已清理7天前的备份"
else
    echo "⚠️  数据目录不存在"
fi

# 列出备份
echo ""
echo "📦 备份列表:"
ls -lh $BACKUP_DIR/backup_*.tar.gz 2>/dev/null || echo "无备份文件"
