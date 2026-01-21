#!/bin/bash

# CentOS 7 Node.js 安装脚本
# 使用方法: bash scripts/install-nodejs-centos7.sh

set -e

echo "🔧 安装 Node.js for CentOS 7..."

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查是否已安装 Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓ Node.js 已安装: $NODE_VERSION${NC}"
    read -p "是否重新安装？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

echo ""
echo "选择安装方法："
echo "1) 使用 NVM 安装 Node.js 18（推荐，兼容性最好）"
echo "2) 使用 RPM 源安装 Node.js 18"
echo "3) 使用预编译二进制文件"
read -p "请选择 (1-3): " choice

case $choice in
    1)
        echo -e "${GREEN}使用 NVM 安装...${NC}"
        
        # 安装 NVM
        if [ ! -d "$HOME/.nvm" ]; then
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        fi
        
        # 加载 NVM
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
        
        # 安装 Node.js 18
        nvm install 18
        nvm use 18
        nvm alias default 18
        
        # 添加到 .bashrc
        if ! grep -q "NVM_DIR" ~/.bashrc; then
            echo '' >> ~/.bashrc
            echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
            echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
            echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> ~/.bashrc
        fi
        
        echo -e "${GREEN}✓ NVM 和 Node.js 18 安装完成${NC}"
        ;;
        
    2)
        echo -e "${GREEN}使用 RPM 源安装...${NC}"
        
        # 清理之前的安装
        sudo yum remove nodejs npm -y 2>/dev/null || true
        sudo rm -rf /etc/yum.repos.d/nodesource*.repo 2>/dev/null || true
        
        # 安装 Node.js 18
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs
        
        echo -e "${GREEN}✓ Node.js 18 安装完成${NC}"
        ;;
        
    3)
        echo -e "${GREEN}使用预编译二进制文件...${NC}"
        
        cd /opt
        wget https://nodejs.org/dist/v18.20.4/node-v18.20.4-linux-x64.tar.xz
        tar -xf node-v18.20.4-linux-x64.tar.xz
        
        # 创建符号链接
        sudo ln -sf /opt/node-v18.20.4-linux-x64/bin/node /usr/local/bin/node
        sudo ln -sf /opt/node-v18.20.4-linux-x64/bin/npm /usr/local/bin/npm
        sudo ln -sf /opt/node-v18.20.4-linux-x64/bin/npx /usr/local/bin/npx
        
        # 添加到 PATH
        if ! grep -q "/opt/node-v18.20.4-linux-x64/bin" ~/.bashrc; then
            echo 'export PATH=/opt/node-v18.20.4-linux-x64/bin:$PATH' >> ~/.bashrc
        fi
        
        echo -e "${GREEN}✓ Node.js 18 安装完成${NC}"
        ;;
        
    *)
        echo -e "${RED}无效选择${NC}"
        exit 1
        ;;
esac

# 验证安装
echo ""
echo "验证安装..."
if command -v node &> /dev/null; then
    echo -e "${GREEN}✓ Node.js 版本: $(node -v)${NC}"
    echo -e "${GREEN}✓ npm 版本: $(npm -v)${NC}"
else
    echo -e "${RED}✗ Node.js 安装失败${NC}"
    exit 1
fi

# 安装 PM2
echo ""
echo "安装 PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    echo -e "${GREEN}✓ PM2 安装完成${NC}"
else
    echo -e "${GREEN}✓ PM2 已安装${NC}"
fi

echo ""
echo -e "${GREEN}✅ 安装完成！${NC}"
echo ""
echo "下一步："
echo "1. 如果使用 NVM，请执行: source ~/.bashrc"
echo "2. 继续部署项目"
