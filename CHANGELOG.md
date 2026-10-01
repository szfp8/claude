# Changelog

## v1.0.0

### Deployment

- 支持 GitHub Fork 后直接部署
- 支持全新 Cloudflare 账号
- 自动初始化 D1/KV/R2
- 自动执行 migrations

### Cloudflare

- 修复 Worker 名称覆盖问题
- 修复 D1 资源匹配问题
- 移除固定 database_id 依赖

### CI/CD

- 增加 GitHub Actions 校验
- 增加仓库完整性检查
- 增加部署诊断工具
