# Cloudflare Workers 一键部署

## 1. 唯一代码源

本仓库就是 Cloudflare 的生产代码源：

```text
https://github.com/szfp8/claude
```

Cloudflare「设置您的应用程序」里的：

```text
创建专用 Git 存储库 = 关闭
```

不要再创建第二个 `white-label-cms` GitHub 仓库。

## 2. 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fszfp8%2Fclaude)

### Workers Builds

```text
Production branch = main
Root directory   = /
Build command    = npm run build
Deploy command   = npm run deploy
Node.js          = 26.10.0
```

### 资源绑定

```text
KV      → CACHE_KV
D1      → DB
R2      → R2_MEDIA
AI      → AI
Assets  → ASSETS
```

### 首次部署

```text
读取复制        = 关闭
Preview Builds   = 关闭
Cloudflare Access= 关闭
```

首次部署 Secret：

```text
SETUP_TOKEN = openssl rand -hex 32
```

可选兼容 Secret（首次部署不需要）：

```text
JWT_SECRET            = 可选；不填由 CACHE_KV 自动生成
PBKDF2_ITERATIONS     = 可选；默认值即可
INDEXNOW_KEY          = 后台「系统设置」配置
EXTERNAL_AI_API_KEY   = 后台「AI 设置」配置
RESEND_API_KEY        = 后台「系统设置」配置
GOOGLE_SERVICE_ACCOUNT_JSON = 后台「系统设置」配置
```

后台密钥不会回显，应用会加密保存。

## 3. 部署闭环

```text
npm ci
  ↓
npm run build
  ↓
npm run deploy
  ↓
D1 migrations
  ↓
Worker deploy
  ↓
postdeploy:check
```

## 4. 上线验收

```text
[ ] Worker URL
[ ] /healthz?probe=1
[ ] DB / CACHE_KV / R2_MEDIA / AI / ASSETS
[ ] d1_schema=true
[ ] /admin/setup（创建唯一管理员）
[ ] /admin/settings（站点 / IndexNow / Resend / Google 按需配置）
[ ] /admin/ai-settings（AI 通道 / 模型 / 外部 Key）
[ ] /admin/ai-prompts（统一提示词）
[ ] /admin/keywords（候选词 / 机会分 / 矩阵 / 页面 SEO 分工）
[ ] /admin/seo（Sitemap / Robots / 收录通知）
```

如果第一轮已经创建 Worker、D1、KV、R2，后续步骤失败时不要重新创建资源，直接修复失败步骤并重新部署。

## 5. 手动部署

```bash
npm ci
npx wrangler login
npm run doctor
npm run verify
npm run validate:complete
npm run deploy
```

手动路径和 Cloudflare Workers Builds 共用同一个 `npm run deploy`。

当前版本：v1.0.0
