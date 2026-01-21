#!/bin/bash

# 远程部署脚本
# 使用方法: bash scripts/remote-deploy.sh

set -e

SERVER_IP="47.96.3.44"
SERVER_USER="root"
SERVER_PASS="Zengdan@520"
PROJECT_DIR="/root/startup-graveyard"

echo "🚀 开始远程部署到 $SERVER_IP..."

# 检查sshpass是否安装
if ! command -v sshpass &> /dev/null; then
    echo "安装 sshpass..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install hudochenkov/sshpass/sshpass 2>/dev/null || echo "请手动安装: brew install hudochenkov/sshpass/sshpass"
    else
        sudo apt-get install -y sshpass || sudo yum install -y sshpass
    fi
fi

# 创建本地压缩包
echo "📦 打包项目..."
cd "$(dirname "$0")/.."
tar --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='data/*.json' \
    -czf /tmp/startup-graveyard.tar.gz .

# 上传到服务器
echo "📤 上传文件到服务器..."
sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no /tmp/startup-graveyard.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/

# 执行远程部署
echo "🔧 在服务器上执行部署..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
set -e

PROJECT_DIR="/root/startup-graveyard"

# 解压文件
echo "📦 解压文件..."
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR
tar -xzf /tmp/startup-graveyard.tar.gz
rm /tmp/startup-graveyard.tar.gz

# 确保数据目录存在
mkdir -p data logs

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo "安装Docker..."
    sudo yum install -y yum-utils
    sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    sudo yum install -y docker-ce docker-ce-cli containerd.io
    sudo systemctl start docker
    sudo systemctl enable docker
fi

# 使用Docker Compose插件或docker-compose
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
    echo "✅ 使用 Docker Compose 插件"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
    echo "✅ 使用 docker-compose"
else
    echo "安装 Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    COMPOSE_CMD="docker-compose"
fi

# 构建并启动
cd $PROJECT_DIR
echo "🐳 构建Docker镜像..."
$COMPOSE_CMD build

echo "🚀 启动容器..."
$COMPOSE_CMD down 2>/dev/null || true
$COMPOSE_CMD up -d

# 等待容器启动
sleep 5

# 检查状态
echo "📊 容器状态:"
$COMPOSE_CMD ps

echo ""
echo "✅ 部署完成！"
echo "🌐 访问地址: http://47.96.3.44:3000"
echo "📝 查看日志: cd $PROJECT_DIR && $COMPOSE_CMD logs -f"

ENDSSH

echo ""
echo "✅ 远程部署完成！"
echo "🌐 访问地址: http://47.96.3.44:3000"
echo ""
echo "📝 查看日志:"
echo "   ssh root@47.96.3.44 'cd /root/startup-graveyard && docker compose logs -f'"
