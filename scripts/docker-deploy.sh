#!/bin/bash

# Docker 部署脚本（CentOS 7）
# 使用方法: bash scripts/docker-deploy.sh

set -e

echo "🐳 Docker 部署脚本（CentOS 7）..."

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}⚠ 建议使用root用户运行此脚本${NC}"
fi

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}安装Docker...${NC}"
    
    # 安装Docker
    sudo yum install -y yum-utils
    sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    sudo yum install -y docker-ce docker-ce-cli containerd.io
    
    # 启动Docker
    sudo systemctl start docker
    sudo systemctl enable docker
    
    echo -e "${GREEN}✓ Docker 安装完成${NC}"
else
    echo -e "${GREEN}✓ Docker 已安装: $(docker --version)${NC}"
fi

# 检查Docker Compose（优先使用docker compose插件，如果没有则使用docker-compose）
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
    echo -e "${GREEN}✓ Docker Compose 插件已安装${NC}"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
    echo -e "${GREEN}✓ Docker Compose 已安装: $(docker-compose --version)${NC}"
else
    echo -e "${YELLOW}安装Docker Compose...${NC}"
    
    # 尝试安装Docker Compose插件（推荐）
    if ! docker compose version &> /dev/null; then
        # 下载Docker Compose独立版本
        sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
        
        # 如果还是失败，尝试使用pip安装
        if [ ! -f "/usr/local/bin/docker-compose" ] || [ ! -x "/usr/local/bin/docker-compose" ]; then
            echo -e "${YELLOW}尝试使用pip安装...${NC}"
            sudo yum install -y python3-pip
            sudo pip3 install docker-compose
        fi
    fi
    
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        echo -e "${RED}✗ Docker Compose 安装失败${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Docker Compose 安装完成${NC}"
fi

# 确保数据目录存在
mkdir -p data logs

# 初始化数据（如果数据文件为空）
if [ ! -f "data/startups.json" ] || [ "$(cat data/startups.json 2>/dev/null | grep -c '\[' || echo 0)" = "1" ]; then
    echo -e "${YELLOW}初始化数据...${NC}"
    # 数据会在容器内初始化
fi

# 构建并启动
echo -e "${GREEN}构建Docker镜像...${NC}"
$COMPOSE_CMD build

echo -e "${GREEN}启动容器...${NC}"
$COMPOSE_CMD up -d

# 等待容器启动
echo -e "${YELLOW}等待容器启动...${NC}"
sleep 5

# 检查容器状态
if docker ps | grep -q "startup-graveyard"; then
    echo -e "${GREEN}✅ 部署完成！${NC}"
    echo ""
    echo "📊 容器状态:"
    $COMPOSE_CMD ps
    echo ""
    echo "📝 查看日志: $COMPOSE_CMD logs -f"
    echo "🔄 重启: $COMPOSE_CMD restart"
    echo "⏹️  停止: $COMPOSE_CMD down"
    echo ""
    echo "🌐 访问地址: http://your-server-ip:3000"
else
    echo -e "${RED}✗ 容器启动失败，查看日志: $COMPOSE_CMD logs${NC}"
    exit 1
fi

# 配置防火墙
echo -e "${YELLOW}配置防火墙...${NC}"
if systemctl is-active --quiet firewalld; then
    sudo firewall-cmd --permanent --add-port=3000/tcp 2>/dev/null || true
    sudo firewall-cmd --reload 2>/dev/null || true
    echo -e "${GREEN}✓ 防火墙已配置${NC}"
else
    echo -e "${YELLOW}⚠ firewalld未运行，跳过防火墙配置${NC}"
fi
