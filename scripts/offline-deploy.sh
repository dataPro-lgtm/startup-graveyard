#!/bin/bash

# 离线部署方案：在本地构建镜像，然后导出导入到服务器

set -e

SERVER_IP="47.96.3.44"
SERVER_USER="root"
IMAGE_NAME="startup-graveyard"
IMAGE_TAG="latest"

echo "📦 离线部署方案"
echo ""
echo "步骤1: 在本地构建Docker镜像..."
cd "$(dirname "$0")/.."

# 使用国内镜像源构建
docker build -f Dockerfile.aliyun -t ${IMAGE_NAME}:${IMAGE_TAG} .

echo ""
echo "步骤2: 导出镜像..."
docker save ${IMAGE_NAME}:${IMAGE_TAG} | gzip > /tmp/${IMAGE_NAME}.tar.gz

echo ""
echo "步骤3: 上传镜像到服务器..."
echo "请执行以下命令："
echo ""
echo "  scp /tmp/${IMAGE_NAME}.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/"
echo ""
echo "步骤4: 在服务器上导入镜像并运行："
echo ""
echo "  ssh ${SERVER_USER}@${SERVER_IP}"
echo ""
echo "然后在服务器上执行："
echo ""
cat << 'EOF'
  # 导入镜像
  gunzip -c /tmp/startup-graveyard.tar.gz | docker load
  
  # 创建数据目录
  mkdir -p /root/startup-graveyard/data
  mkdir -p /root/startup-graveyard/logs
  
  # 运行容器
  docker run -d \
    --name startup-graveyard \
    -p 3000:3000 \
    -v /root/startup-graveyard/data:/app/data \
    -v /root/startup-graveyard/logs:/app/logs \
    --restart unless-stopped \
    startup-graveyard:latest
  
  # 查看日志
  docker logs -f startup-graveyard
EOF

echo ""
echo "✅ 镜像已导出到: /tmp/${IMAGE_NAME}.tar.gz"
echo "📊 文件大小:"
ls -lh /tmp/${IMAGE_NAME}.tar.gz
