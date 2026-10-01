# Cloudflare Workers 白标 CMS

可复刻、可 Fork、可独立部署的 Cloudflare Workers CMS 基础模板。

设计目标：新的 Cloudflare 账号、Worker、D1、KV、R2 环境，都可以直接从 GitHub 仓库完成一次性部署，不依赖 ZIP 文件，也不需要人工创建 Cloudflare 资源。

## 新环境一键部署

标准流程：

```text
GitHub Repository
      ↓
GitHub Actions 校验
      ↓
Cloudflare Workers Builds
      ↓
npm ci
      ↓
npm run verify
      ↓
npm run deploy
      ↓
scripts/deploy-all.mjs
      ↓
检查 Cloudflare 资源
      ↓
自动创建 KV / D1 / R2
      ↓
执行 D1 migrations
      ↓
部署 Worker
      ↓
执行健康检查
```

## Fork / 复制部署规范

复制仓库到新的 GitHub 账号后：

1. 创建 Cloudflare Workers Build 项目
2. 连接新的 GitHub Repository
3. 安装依赖：

```bash
npm ci
```

4. 检查仓库：

```bash
npm run verify
```

5. 部署：

```bash
npm run deploy
```

不需要：

- 下载 ZIP
- 本地安装 Wrangler
- 手动创建 D1
- 手动复制 database_id
- 手动执行 migration

## GitHub Actions 自动检查

仓库包含：

```text
.github/workflows/verify.yml
```

每次 push 或 pull request 到 main 时自动执行：

```bash
npm ci
npm run validate:complete
```

用于提前发现：

- 文件缺失
- 配置错误
- TypeScript 错误
- migration 问题
- 部署脚本问题

## Cloudflare Workers Builds 配置

```text
Production branch = main
Root directory    = /
Build command     = 留空
Deploy command    = npm run deploy
Node.js           = 26.10.0
```

## 自动创建资源

首次部署自动创建：

- D1 Database
- KV Namespace
- R2 Bucket
- Workers AI Binding
- Static Assets

资源绑定统一由 `wrangler.toml` 管理。

## 部署检查

部署完成后访问：

```text
/healthz?probe=1
```

正常结果：

```json
{
  "d1_schema": true,
  "missing_tables": []
}
```

## 本地开发

```bash
npm ci
npm run verify
npm run build
npm run db:migrate:local
npm run dev
```
