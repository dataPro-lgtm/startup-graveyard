#!/bin/bash

# 修复Docker镜像源问题

echo "🔧 配置Docker国内镜像源..."

# 备份原配置
if [ -f /etc/docker/daemon.json ]; then
    sudo cp /etc/docker/daemon.json /etc/docker/daemon.json.bak
fi

# 配置多个国内镜像源
sudo tee /etc/docker/daemon.json > /dev/null << 'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com",
    "https://ccr.ccs.tencentyun.com"
  ]
}
EOF

# 重启Docker
echo "🔄 重启Docker服务..."
sudo systemctl daemon-reload
sudo systemctl restart docker

# 等待Docker启动
sleep 3

# 测试连接
echo "🧪 测试镜像源连接..."
if docker pull hello-world:latest > /dev/null 2>&1; then
    echo "✅ Docker镜像源配置成功！"
    docker rmi hello-world:latest > /dev/null 2>&1
else
    echo "❌ 镜像源测试失败，尝试其他方案..."
    exit 1
fi
