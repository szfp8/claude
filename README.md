# Cloudflare Workers 白标 CMS

可复刻、可下载 ZIP、可切换行业、可独立部署的 Cloudflare Workers CMS 基础模板。

首次部署保持白标空站点：不预置具体行业、城市、服务、文章、关键词或联系方式。部署后通过后台配置站点名称、主题、行业、服务、城市、资讯来源、SEO 与联系方式。

## 最新部署闭环

当前部署流程已经统一为：

```text
npm run deploy
  ↓
scripts/deploy-all.mjs
  ↓
检测远程 D1 migration 状态
  ↓
首次部署时创建 Cloudflare 资源
  ↓
校验 D1 resource 与 DB binding
  ↓
执行远程 migrations
  ↓
重新部署 Worker
  ↓
postdeploy:check 验收
```

首次部署不需要手动创建 D1 database_id。部署脚本会在 Cloudflare 创建资源后校验实际 D1 resource，再执行 schema 初始化。

## 核心能力

- Hono + TypeScript + Cloudflare Workers
- D1、KV、R2、Workers AI、Workers Assets
- Workers AI + OpenAI-compatible AI 通道
- 中文白标前台
- 页面管理：首页、服务项目、服务城市、新闻资讯、关于我们、联系我们
- Sitemap / robots / llms.txt
- SEO 路由与 AI 发布流程

## 一键部署

Workers Builds 配置：

```text
Production branch = main
Root directory    = /
Build command     = 留空
Deploy command    = npm run deploy
Node.js           = 26.10.0
```

Cloudflare 默认 `npx wrangler deploy` 只会发布 Worker，不会执行完整 D1 初始化流程，因此需要使用：

```bash
npm run deploy
```

部署完成后检查：

```text
/healthz?probe=1
```

确认：

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

## 路由

```text
/
/service
/city
/article
/about
/contact
/search
```

## 目标

作为 Cloudflare Workers 白标 CMS 基础模板，可持续 Fork、ZIP 复制、配置站点后独立部署。
