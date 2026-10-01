# Cloudflare Workers 白标 CMS

可复刻、可 Fork、可独立部署的 Cloudflare Workers CMS 基础模板。

设计目标：新的 Cloudflare 账号、Worker、D1、KV、R2 环境，都可以直接从 GitHub 仓库完成一次性部署，不依赖 ZIP 文件，也不需要人工创建 Cloudflare 资源。

## 新环境一键部署

标准流程：

```text
GitHub Repository
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

不需要：

- 下载 ZIP
- 本地安装 Wrangler
- 手动创建 D1
- 手动复制 database_id
- 手动执行 migration

## Fork / 复制部署规范

复制仓库到新的 GitHub 账号后：

1. 创建 Cloudflare Workers Build 项目
2. 连接新的 GitHub Repository
3. 安装依赖：

```bash
npm ci
```

4. 执行仓库检查：

```bash
npm run verify
```

5. 部署：

```bash
npm run deploy
```

Cloudflare 会自动完成资源初始化。

## 仓库完整性检查

`npm run verify` 会检查：

- 必需源码文件
- 必需目录
- package.json 部署脚本
- TypeScript 部署入口
- Wrangler 配置
- D1 binding
- D1 database_name

用于保证 Fork 后仓库可以独立复刻。

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

## 部署完整性检查

部署流程会检查：

- Wrangler 是否安装
- Cloudflare 资源是否存在
- D1 是否可访问
- migrations 是否执行
- Worker 是否成功发布
- 部署后健康状态

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
