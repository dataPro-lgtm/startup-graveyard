# CentOS 7 Node.js 安装问题修复

## 问题
CentOS 7 的 glibc 版本（2.17）太旧，Node.js 20 需要 glibc >= 2.28。

## 解决方案

### 方案1: 使用 NVM 安装（推荐）

NVM 可以安装兼容的 Node.js 版本，无需系统依赖。

```bash
# 安装 NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新加载shell配置
source ~/.bashrc
# 或
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 安装 Node.js 18（兼容 CentOS 7）
nvm install 18
nvm use 18
nvm alias default 18

# 验证安装
node -v
npm -v
```

### 方案2: 使用 Node.js 18（兼容版本）

```bash
# 使用 Node.js 18 的 RPM 源
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 验证
node -v
npm -v
```

### 方案3: 使用预编译二进制文件

```bash
# 下载 Node.js 18 LTS 二进制文件
cd /opt
wget https://nodejs.org/dist/v18.20.4/node-v18.20.4-linux-x64.tar.xz

# 解压
tar -xf node-v18.20.4-linux-x64.tar.xz

# 创建符号链接
sudo ln -s /opt/node-v18.20.4-linux-x64/bin/node /usr/local/bin/node
sudo ln -s /opt/node-v18.20.4-linux-x64/bin/npm /usr/local/bin/npm
sudo ln -s /opt/node-v18.20.4-linux-x64/bin/npx /usr/local/bin/npx

# 验证
node -v
npm -v
```

## 推荐：使用 NVM（最简单）

完整安装步骤：

```bash
# 1. 安装 NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 2. 加载 NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 3. 安装 Node.js 18
nvm install 18
nvm use 18
nvm alias default 18

# 4. 验证
node -v  # 应该显示 v18.x.x
npm -v

# 5. 安装 PM2
npm install -g pm2

# 6. 继续部署项目
cd /var/www/startup-graveyard
npm install --production
npm run init-data
npm run build
pm2 start npm --name "startup-graveyard" -- start
```

## 永久设置 NVM（开机自动加载）

```bash
# 编辑 .bashrc
nano ~/.bashrc

# 在文件末尾添加：
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# 保存并重新加载
source ~/.bashrc
```

## 验证安装

```bash
# 检查 Node.js 版本
node -v

# 检查 npm 版本
npm -v

# 检查 PM2
pm2 -v
```

## 注意事项

1. **Node.js 18 完全兼容**：Next.js 14 支持 Node.js 18+
2. **性能无影响**：Node.js 18 性能与 20 相当
3. **长期支持**：Node.js 18 是 LTS 版本，支持到 2025年

## 如果之前尝试安装了 Node.js 20

```bash
# 清理之前的安装尝试
sudo yum remove nodejs npm -y
sudo rm -rf /etc/yum.repos.d/nodesource*.repo

# 然后使用上面的方案重新安装
```
