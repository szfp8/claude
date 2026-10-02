# Cloudflare Workers 一键部署

## 最简单的方法：点击按钮

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fszfp8%2Fclaude)

Cloudflare 会创建你的 GitHub 副本，并引导配置 Worker、D1、KV、R2。

## Workers Builds

```text
Production branch = main
Root directory   = /
Build command    = npm run build
Deploy command   = npm run deploy
Node.js          = 26.10.0
```

## 手动部署

```bash
npm ci
npx wrangler login
npm run doctor
npm run verify
npm run validate:complete
npm run deploy
```

## 名称规则

手动连接已有 Workers Builds 时：

```text
Cloudflare Worker name = wrangler.toml -> name
```

D1 绑定固定为：

```toml
binding = "DB"
database_name = "white-label-cms-db"
migrations_dir = "migrations"
```

不提交 `database_id`、KV `id`、Token 或生产 Secret。

## 上线检查

```text
[ ] Worker URL
[ ] /healthz?probe=1
[ ] D1 migrations
[ ] /admin/setup
[ ] JWT_SECRET / SETUP_TOKEN
```

当前版本：v1.0.0
