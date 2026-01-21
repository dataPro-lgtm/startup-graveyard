#!/bin/bash

# Docker部署修复脚本（解决"文本文件忙"问题）

set -e

echo "🔧 修复Docker Compose问题..."

# 方法1: 使用Docker Compose插件（推荐，新版本Docker自带）
if docker compose version &> /dev/null; then
    echo "✅ 使用 Docker Compose 插件"
    COMPOSE_CMD="docker compose"
    
    # 构建并启动
    echo "构建镜像..."
    docker compose build
    
    echo "启动容器..."
    docker compose up -d
    
    echo "✅ 部署完成！"
    docker compose ps
    exit 0
fi

# 方法2: 重新安装docker-compose
echo "重新安装 docker-compose..."

# 删除旧文件
sudo rm -f /usr/local/bin/docker-compose

# 下载新文件
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /tmp/docker-compose
sudo mv /tmp/docker-compose /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证
if docker-compose --version &> /dev/null; then
    echo "✅ docker-compose 安装成功"
    docker-compose build
    docker-compose up -d
    docker-compose ps
else
    echo "❌ 安装失败，尝试使用pip安装..."
    sudo yum install -y python3-pip
    sudo pip3 install docker-compose
    docker-compose build
    docker-compose up -d
    docker-compose ps
fi
