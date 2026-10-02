# Changelog

## v1.0.0 — 2026-10-02

### Deployment
- 固化 Cloudflare 一键部署入口与最终 README 流程。
- 统一 Worker、D1、KV、R2 的模板默认资源配置。
- 保留 `DB` D1 binding，禁止提交账号级资源 ID。
- 保持 `npm run deploy` 为唯一标准发布入口。

### CI / Integrity
- 修复 Repository Verify 对无 `database_id` 配置的错误判断。
- 补齐 CI 调用的 `check:* ` npm scripts。
- 强化仓库完整性、版本和部署配置检查。
- 收口为单一权威 Cloudflare 验证工作流。

### Cleanup
- 删除重复的完整源码 ZIP artifact 打包步骤。
- 删除旧的、与当前 package scripts 不一致的校验调用。
- 清理旧版快速部署文档中的“手工修改 Worker name”误导步骤。

### Release
- `package.json` version = `1.0.0`
- `VERSION` = `1.0.0`
