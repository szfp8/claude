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
首次 Worker deploy / Cloudflare resource provisioning
        ↓
wrangler d1 migrations apply DB --remote
        ↓
Worker deploy
        ↓
postdeploy:check
        ↓
完成
```

不再执行首次部署前的 D1 probe；全新账号中 D1 可能尚不存在，应先完成资源 provisioning。

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

`wrangler.toml` 的 `name = "white-label-cms"` 必须与 Cloudflare Dashboard 中连接的 Worker 名称一致；部署脚本不再覆盖该名称。

默认名称是：

```text
white-label-cms
```

## 6. Secret

首次部署不需要第三方 Secret；`SETUP_TOKEN`、`JWT_SECRET` 等按需配置。；`JWT_SECRET`、`PBKDF2_ITERATIONS` 以及 IndexNow / AI / 邮件 / Google 等服务按需配置。第三方服务密钥推荐在后台设置，避免把非必要配置带入第一次资源创建。

## 7. 部署后验收

`npm run postdeploy:check` 会：

1. 从部署输出中获取 workers.dev URL（如果存在）。
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
