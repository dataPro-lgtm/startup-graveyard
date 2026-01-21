# GitHub 上传指南

## 步骤1: 创建GitHub仓库

1. 登录GitHub
2. 点击右上角的 "+" 按钮，选择 "New repository"
3. 填写仓库信息：
   - Repository name: `startup-graveyard`
   - Description: `创业坟场 - 记录和分析创业失败案例的数据库平台`
   - 选择 Public 或 Private
   - **不要**勾选 "Initialize this repository with a README"
4. 点击 "Create repository"

## 步骤2: 连接本地仓库到GitHub

```bash
# 添加远程仓库（替换YOUR_USERNAME为你的GitHub用户名）
git remote add origin https://github.com/YOUR_USERNAME/startup-graveyard.git

# 或者使用SSH（如果你配置了SSH密钥）
git remote add origin git@github.com:YOUR_USERNAME/startup-graveyard.git
```

## 步骤3: 提交代码

```bash
# 查看要提交的文件
git status

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit: 创业坟场项目

- 实现失败案例数据库和展示
- 添加搜索、筛选、排序功能
- 实现数据可视化统计面板
- 添加自动数据采集功能
- 实现定时任务系统
- 添加管理后台页面"

# 推送到GitHub
git branch -M main
git push -u origin main
```

## 步骤4: 验证

访问你的GitHub仓库页面，确认代码已成功上传。

## 后续更新

```bash
# 添加更改
git add .

# 提交
git commit -m "描述你的更改"

# 推送
git push
```

## 注意事项

1. **敏感信息**: 确保 `.env` 文件已添加到 `.gitignore`
2. **数据文件**: `data/*.json` 文件已包含在仓库中，如果需要可以添加到 `.gitignore`
3. **node_modules**: 已自动忽略，不会上传

## 可选：添加GitHub Actions

项目已包含基本的CI配置，GitHub会自动运行lint和build检查。

## 可选：添加GitHub Pages

如果需要部署到GitHub Pages，可以：
1. 在仓库设置中启用GitHub Pages
2. 选择 `gh-pages` 分支或 `main` 分支的 `/docs` 目录
3. 配置Next.js的静态导出
