/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // 新功能
        'fix', // Bug 修复
        'refactor', // 重构（非功能、非修复）
        'perf', // 性能优化
        'style', // 格式调整（不影响逻辑）
        'test', // 测试相关
        'docs', // 文档
        'build', // 构建系统 / 依赖变更
        'ci', // CI/CD 配置
        'chore', // 杂项（不触及业务逻辑）
        'revert', // 回滚
        'db', // 数据库迁移 / seed
        'infra', // 基础设施 / DevOps
      ],
    ],
    'scope-case': [2, 'always', 'lower-case'],
    'subject-case': [0], // 允许中文 subject
    'header-max-length': [2, 'always', 100],
  },
};
