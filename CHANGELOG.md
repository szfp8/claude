# Changelog

## v1.0.1 — 2026-10-03

### Reliability / AI collection
- 修正每 5 分钟 Cloudflare Cron 与后台北京时间采集时间的调度窗口，避免非 5 分钟整点配置被永远错过。
- 为定时新闻采集增加短期 KV 防重复锁；即使 Cron 重试，也由来源 URL 去重作为第二层幂等保障。
- 明确 AI 新闻采集始终进入 `pending_review`，不会绕过人工审核自动公开。

### Repository integrity
- 完成部署、D1、路由快照、AI 采集、文章审核发布、媒体上传和 CI 配置的一致性巡检。
- 保留历史迁移、`.nvmrc`、路由快照和测试/校验脚本等仍被运行链路使用的文件，不做无依据删减。


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
