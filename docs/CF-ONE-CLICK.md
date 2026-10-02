# Cloudflare 一键部署填写说明

本说明对应 Cloudflare **「设置您的应用程序」** / Deploy to Cloudflare 页面。

## 1. Git 仓库

本仓库使用**现有 GitHub 仓库作为唯一代码源**：

```text
szfp8/claude
```

Cloudflare 页面如果出现：

```text
创建专用 Git 存储库
```

请**不要勾选**。

不要再创建 `white-label-cms` 之类的第二份 GitHub 仓库，否则会产生两个代码源，后续修改容易部署错仓库。

## 2. 应用设置

| 字段 | 值 |
|---|---|
| Git 帐户 | GitHub |
| 创建专用 Git 存储库 | **关闭** |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Node.js | `26.10.0` |
| 启用读取复制 | 关闭 |
| 启用预览构建 | 首次部署关闭 |
| Cloudflare Access | 首次部署关闭 |

## 3. 资源

选择当前 Cloudflare 账号中的资源，并按下面名称绑定：

| 资源 | Binding |
|---|---|
| KV | `CACHE_KV` |
| D1 | `DB` |
| R2 | `R2_MEDIA` |
| Workers AI | `AI` |
| Assets | `ASSETS` |

如果当前账号还没有这些资源，可以在 Cloudflare 创建页面创建；创建后必须绑定到上述名称。

**不要把其他账号的 database ID、KV ID 写进仓库。**

## 4. Secrets

首次部署需要 Cloudflare 页面提供的 Secret 值。

```text
JWT_SECRET
SETUP_TOKEN
PBKDF2_ITERATIONS
INDEXNOW_KEY
EXTERNAL_AI_API_KEY
RESEND_API_KEY
GOOGLE_SERVICE_ACCOUNT_JSON
```

推荐：

```text
JWT_SECRET                  = openssl rand -hex 32
SETUP_TOKEN                 = openssl rand -hex 32
PBKDF2_ITERATIONS           = 100000
INDEXNOW_KEY                = openssl rand -hex 16
EXTERNAL_AI_API_KEY         = unused（不用外部 AI 时）
RESEND_API_KEY              = unused（不用邮件时）
GOOGLE_SERVICE_ACCOUNT_JSON = {}（不用 Google 时）
```

`unused` / `{}` 只是 Cloudflare UI 强制字段时的安全占位值，不代表对应服务已经启用。启用服务前必须替换成真实配置。

## 5. 一键部署链路

Cloudflare Workers Builds 使用：

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

`npm run deploy` 是仓库唯一生产部署入口。

## 6. D1 首次部署

`scripts/deploy-all.mjs` 会专门读取：

```toml
[[d1_databases]]
binding = "DB"
```

不会读取 Assets 的：

```toml
[assets]
binding = "ASSETS"
```

因此不会再次出现：

```text
Couldn't find a D1 DB with the name or binding 'ASSETS'
```

如果第一轮已经创建 Worker/KV/D1/R2，后续失败时不要删除资源，直接重试部署。

## 7. 部署后验收

访问：

```text
/healthz?probe=1
```

确认：

```text
DB=true
CACHE_KV=true
R2_MEDIA=true
AI=true
ASSETS=true
d1_schema=true
missing_tables=[]
```

然后：

```text
/admin/setup
/admin/settings
```

完成初始化。

## 8. Deploy 按钮

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/szfp8/claude)
