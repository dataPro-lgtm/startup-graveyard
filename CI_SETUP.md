# CI/CD 设置指南

## 为什么移除了 workflows 目录？

GitHub 对 `.github/workflows/` 目录下的任何文件都需要 Personal Access Token 具有 `workflow` 权限。为了避免推送问题，我们暂时移除了这个目录。

## 如何启用 CI/CD

### 方法1: 更新 Personal Access Token（推荐）

1. 访问 https://github.com/settings/tokens
2. 找到你正在使用的 Personal Access Token
3. 点击 "Edit" 或创建新的 Token
4. 在权限列表中，勾选 `workflow` 权限
5. 保存 Token
6. 重新推送代码

### 方法2: 使用 SSH 密钥

```bash
# 更改远程仓库URL为SSH
git remote set-url origin git@github.com:dataPro-lgtm/startup-graveyard.git

# 推送
git push -u origin main
```

使用SSH不需要workflow权限。

### 方法3: 在GitHub网页上创建workflow文件

1. 推送代码后（不包含workflows目录）
2. 在GitHub网页上，点击 "Add file" -> "Create new file"
3. 路径输入：`.github/workflows/ci.yml`
4. 粘贴以下内容：

```yaml
name: CI

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linter
      run: npm run lint
    
    - name: Build
      run: npm run build
```

5. 提交文件

## 当前状态

- ✅ Issue 模板已保留（`.github/ISSUE_TEMPLATE/`）
- ❌ CI workflow 文件已移除（需要workflow权限）
- 📝 CI 配置说明已移到 `CI_SETUP.md`
