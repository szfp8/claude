# 部署架构与首次部署说明

本文描述当前 `main` 分支的真实部署闭环。

## 1. 唯一生产部署入口

```bash
npm run deploy
```

对应：

```text
scripts/deploy-all.mjs
```

Cloudflare Workers Builds 的 Deploy command 必须是：

```text
npm run deploy
```

不能改成单独的 `npx wrangler deploy`，否则会跳过 D1 migration 和部署后验收。

## 2. 首次部署

```text
Cloudflare Workers Builds
        ↓
npm ci
        ↓
npm run build
        ↓
npm run deploy
        ↓
远程 D1 migration probe
        ↓
D1 未就绪 → 首次 Worker deploy
        ↓
wrangler d1 migrations apply DB --remote
        ↓
Worker deploy
        ↓
postdeploy:check
        ↓
完成
```

D1 已存在并可访问时，会跳过首次准备部署，直接迁移并重新发布。

## 3. Cloudflare 绑定

当前绑定：

| Binding | 类型 | 用途 |
|---|---|---|
| `DB` | D1 | CMS 数据 |
| `CACHE_KV` | KV | 缓存、限流、JWT 自动密钥 |
| `R2_MEDIA` | R2 | 媒体 |
| `AI` | Workers AI | AI |
| `ASSETS` | Assets | `public/` |

D1 只从 `[[d1_databases]]` 读取，绝不会把 `ASSETS` 当成 D1。

## 4. 资源名称与账号隔离

模板使用安全的默认资源名称：

```text
white-label-cms-db
white-label-cms-r2-media
```

同时不提交：

```text
database_id
KV id
Cloudflare API Token
生产 Secret
```

这样同一仓库可以在不同 Cloudflare 账号部署。

## 5. Worker 名称

部署脚本支持 Cloudflare 注入的名称：

```text
WRANGLER_CI_OVERRIDE_NAME
→ CLOUDFLARE_WORKER_NAME
→ WORKER_NAME
→ wrangler.toml name
```

默认名称是：

```text
white-label-cms
```

## 6. Secret

标准生产部署需要在 Cloudflare 创建页面配置：

```text
JWT_SECRET
SETUP_TOKEN
PBKDF2_ITERATIONS
INDEXNOW_KEY
```

Cloudflare UI 如果强制显示可选服务字段，则暂时使用：

```text
EXTERNAL_AI_API_KEY=unused
RESEND_API_KEY=unused
GOOGLE_SERVICE_ACCOUNT_JSON={}
```

这些值只作为未启用服务的占位配置。

## 7. 部署后验收

`npm run postdeploy:check` 会：

1. 检查远程 D1 migration 状态。
2. 从部署输出中获取 workers.dev URL（如果存在）。
3. 调用 `/healthz?probe=1`。
4. 检查 DB、KV、R2、AI、Assets 和 D1 schema。

## 8. GitHub Actions

唯一权威 CI：

```text
.github/workflows/deploy.yml
```

它验证仓库完整性和 Wrangler dry-run，不保存或生成生产 Cloudflare Secret。

## 9. 最终原则

- 一个 GitHub 仓库：`szfp8/claude`
- 一个生产部署入口：`npm run deploy`
- 一个 D1 binding：`DB`
- 不把 Assets 当 D1
- 不提交账号专属 ID
- 不提交生产 Secret
- 首次资源创建后失败只重试，不重复创建
