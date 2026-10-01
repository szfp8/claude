# Cloudflare Workers 白标 CMS

可复刻、可下载 ZIP、可切换行业、可独立部署的 Cloudflare Workers CMS 基础模板。

首次部署保持**白标空站点**：不预置具体行业、城市、服务、文章、关键词或联系方式。部署后通过后台配置站点名称、主题、行业、服务、城市、资讯来源、SEO 与联系方式。

## 核心能力

- Hono + TypeScript + Cloudflare Workers
- D1、KV、R2、Workers AI、Workers Assets
- Workers AI + OpenAI-compatible AI 通道
- **仅中文**前台（English 已移除）
- 页面管理：首页、服务项目、服务城市、新闻资讯、关于我们、联系我们
- **站点模块后台** `/admin/modules`：导航标签与桌面/移动顺序、通用联系渠道
- 稳定 SEO 路由：服务详情、城市详情、城市 × 服务落地页、文章详情
- AI 提示词管理、SEO 关键词规范、新闻人工审核发布
- R2 媒体、Sitemap / robots / llms.txt、百度与 IndexNow 通知
- 留言蜜罐、限流、可选 `SETUP_TOKEN`、JWT 可 CACHE_KV 自动生成
- **零配置 Workers Builds** + Node **26.10.0**

## 仓库完整性与 CI

- 工作流与代码清单：[`docs/INTEGRITY.md`](docs/INTEGRITY.md)
- Actions：https://github.com/szfp8/claude/actions
- 一键 Secret 可全空：[`docs/CF-ONE-CLICK.md`](docs/CF-ONE-CLICK.md)
- 部署说明：[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

## 1. 一键部署到 Cloudflare（尽量零手填）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/szfp8/claude)

**有 CF 账号**：按钮或 Dashboard 连接本仓库 → KV/D1/R2 选 **new** → **所有 Secret 可留空** → 部署。

Workers Builds 与仓库对齐：

```text
Production branch = main
Root directory    = /（留空）
Build command     =（留空，由 wrangler.toml [build] 执行）
Deploy command    = npx wrangler deploy
Node.js           = 26.10.0（.nvmrc）
```

向导细节：`docs/CF-ONE-CLICK.md`。

## 2. Secrets（均可留空）

| Secret | 留空时 |
|--------|--------|
| JWT_SECRET | CACHE_KV **自动生成** 256-bit 密钥 |
| SETUP_TOKEN | 无门禁；请尽快 `/admin/setup` |
| 其它 | 对应功能关闭，需要时再填 |

## 3. 部署后

```text
1. /healthz?probe=1
2. /admin/setup
3. /admin/settings
```

## 4. 绑定

| Binding | 用途 |
|---------|------|
| `DB` | D1 |
| `CACHE_KV` | 限流 / JWT 自动密钥 |
| `R2_MEDIA` | 媒体 |
| `AI` | Workers AI |
| `ASSETS` | `public/` |

## 5. 前台路由

`/` · `/service` · `/city` · `/article` · `/about` · `/contact` · `/search`

## 6. GitHub Actions

`.github/workflows/deploy.yml`：校验用，不部署生产。

```text
npm ci → 契约检查 → build → test → D1 local migrate → wrangler dry-run
```

详见 [`docs/INTEGRITY.md`](docs/INTEGRITY.md)。

## 7. 本地开发（可选）

```bash
npm ci && npm run build && npm run db:migrate:local && npm run dev
```

---

目标：可反复 Fork / ZIP、配置站点画像后独立部署的 Cloudflare Workers CMS 基础模板。
