# Cloudflare Workers 白标 CMS

可复刻、可 Fork、可独立部署的 Cloudflare Workers CMS 模板。

目标：复制 GitHub 仓库到新的 Cloudflare 环境后，不依赖 ZIP，不依赖旧账号资源，通过标准流程完成部署。

## 一键部署流程

```text
GitHub Repository
        ↓
Cloudflare Workers Builds
        ↓
npm ci
        ↓
npm run doctor
        ↓
npm run verify
        ↓
npm run deploy
        ↓
自动检查资源
        ↓
D1 migrations
        ↓
Worker 发布
        ↓
健康检查
```

## Cloudflare 复制部署原则

每个 Cloudflare 账号都是独立环境。

仓库不会保存：

- Cloudflare Token
- API Key
- database_id
- 生产 Secret
- 客户数据

复制仓库后由当前 Cloudflare 环境创建自己的：

- Worker
- D1
- KV
- R2
- Assets
- Workers AI

## D1 配置说明

绑定保持稳定：

```toml
binding = "DB"
```

不要提交固定：

```toml
database_id = "xxx"
```

原因：

- 不同 Cloudflare 账号资源 ID 不同
- Fork 后需要新的数据库
- 避免连接旧环境

部署脚本负责检查当前环境并执行 migrations。

## Workers Builds 配置

```text
Production branch = main
Root directory = /
Build command = 留空
Deploy command = npm run deploy
Node.js = 26.10.0
```

## 本地部署

```bash
npm ci
npx wrangler login
npm run doctor
npm run verify
npm run deploy
```

## 检查命令

### 环境诊断

```bash
npm run doctor
```

检查 Node、Wrangler、部署文件。

### 仓库完整性

```bash
npm run verify
```

检查：

- 必需目录
- 必需脚本
- Cloudflare 配置
- D1 binding
- migration 文件

## 部署失败排查

### D1 migration 失败

检查：

```bash
npm run doctor
npm run verify
```

确认：

- DB binding 存在
- migrations 目录存在
- 没有硬编码 database_id

### Worker 名称不一致

Cloudflare Workers Builds 可能注入实际 Worker 名称。

部署脚本优先使用：

```text
WRANGLER_CI_OVERRIDE_NAME
CLOUDFLARE_WORKER_NAME
WORKER_NAME
```

避免白标名称覆盖实际部署目标。

## 项目结构

```text
src/              Worker 源码
migrations/       D1 数据库迁移
scripts/          部署和检查脚本
public/           静态资源
.github/          CI 工作流
wrangler.toml     Cloudflare 配置
```

## v1 发布标准

提交前必须通过：

```bash
npm run doctor
npm run verify
npm run typecheck
npm run validate:complete
```

保持规则：

- 新环境可复制
- 不绑定旧资源
- 部署错误可诊断
- 文档与代码同步

