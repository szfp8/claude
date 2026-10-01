# Cloudflare Workers 白标 CMS

可复刻、可 Fork、可独立部署的 Cloudflare Workers CMS 基础模板。

设计目标：任何新的 Cloudflare 账号、Worker、D1、KV、R2 环境，都可以直接从 GitHub 仓库完成一次性部署，不依赖 ZIP 文件，也不需要手工创建 Cloudflare 资源。

## 新环境一键部署

每次复制仓库后的标准流程：

```text
GitHub Repository
      ↓
Cloudflare Workers Builds
      ↓
npm ci
      ↓
npm run deploy
      ↓
scripts/deploy-all.mjs
      ↓
自动检查 D1
      ↓
首次部署自动创建 KV / D1 / R2
      ↓
绑定资源并执行 migrations
      ↓
重新发布 Worker
      ↓
部署后健康检查
```

无需：

- 下载 ZIP
- 本地安装 Wrangler
- 手动创建 D1
- 手动复制 database_id
- 手动执行 SQL migration

## Cloudflare Workers Builds 配置

```text
Production branch = main
Root directory    = /
Build command     = 留空
Deploy command    = npm run deploy
Node.js           = 26.10.0
```

## 部署资源说明

首次部署会自动创建：

- D1 Database
- KV Namespace
- R2 Bucket
- Workers AI Binding
- Static Assets

资源名称由模板配置统一管理。

## 部署检查

部署完成后访问：

```text
/healthz?probe=1
```

正常结果应包含：

```json
{
  "d1_schema": true,
  "missing_tables": []
}
```

## 本地开发

```bash
npm ci
npm run build
npm run db:migrate:local
npm run dev
```

## 核心能力

- Hono + TypeScript + Cloudflare Workers
- D1 数据库
- KV 缓存
- R2 媒体存储
- Workers AI
- 中文白标前台
- 页面管理
- SEO 路由
- Sitemap / robots / llms.txt

## Fork / 复制规则

本仓库保持白标状态：

- 不包含客户名称
- 不包含城市信息
- 不包含业务关键词
- 不包含真实联系方式
- 不包含生产密钥

复制仓库后，只需要连接新的 Cloudflare Worker，然后执行部署即可。
