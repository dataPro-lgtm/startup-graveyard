# GitHub Actions

## CI/CD 配置

如果需要启用CI/CD，需要：

1. 在GitHub Personal Access Token中添加 `workflow` 权限
2. 或者使用SSH密钥进行推送

## 启用CI

创建 `.github/workflows/ci.yml` 文件：

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
