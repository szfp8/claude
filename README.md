# Cloudflare Workers 白标 CMS

一个可 Fork、可复制、可独立部署的 Cloudflare Workers CMS 模板。

## 🚀 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fszfp8%2Fclaude)

**推荐：直接点击上面的按钮。** Cloudflare 的部署向导会创建你的 GitHub 副本，并引导你配置 Worker、D1、KV、R2 等资源。

### 一键部署后的标准链路

```text
Deploy to Cloudflare
        ↓
创建 GitHub 副本
        ↓
配置 Worker / D1 / KV / R2
        ↓
Workers Builds
        ↓
npm ci
        ↓
npm run build
        ↓
npm run deploy
        ↓
D1 migrations
        ↓
Worker Online
```

> **重要：** 手动连接已有 Workers Builds 时，Cloudflare Dashboard 中的 Worker 名称必须与该副本 `wrangler.toml` 的 `name` 保持一致。不要依赖构建阶段强制覆盖 Worker 名称。

## v1.0.0 最终部署清单

### 部署前

- [ ] 使用顶部 **Deploy to Cloudflare** 按钮，或已经连接自己的 GitHub 仓库
- [ ] Production branch = `main`
- [ ] Root directory = `/`
- [ ] Build command = `npm run build`
- [ ] Deploy command = `npm run deploy`
- [ ] Node.js = `26.10.0`
- [ ] 没有提交 Cloudflare Token、Secret、D1 ID 或 KV ID

### 部署时

- [ ] Worker 名称与当前副本 `wrangler.toml` 一致
- [ ] D1 binding 保持 `DB`
- [ ] D1 使用当前副本的 `database_name`
- [ ] KV/R2 使用当前副本自己的资源
- [ ] migrations 自动执行

### 部署后

- [ ] Worker URL 可以打开
- [ ] `/healthz?probe=1` 正常
- [ ] D1 schema 已完成
- [ ] `/admin/setup` 可访问
- [ ] 首次管理员初始化完成
- [ ] 必要的 `JWT_SECRET` / `SETUP_TOKEN` 已在 Cloudflare Secret 中配置

## Cloudflare 配置原则

模板提供的是**默认资源名称**，不是任何账号的真实资源 ID：

```toml
[[d1_databases]]
binding = "DB"
database_name = "white-label-cms-db"
migrations_dir = "migrations"

[[r2_buckets]]
binding = "R2_MEDIA"
bucket_name = "white-label-cms-r2-media"
```

禁止提交：

- `database_id`
- KV `id`
- Cloudflare API Token
- 生产 Secret
- 用户数据

如果 Deploy to Cloudflare 向导为你的副本写入了不同资源名称，以**新副本中的 `wrangler.toml` 为准**。

## 本地部署

```bash
npm ci
npx wrangler login
npm run doctor
npm run verify
npm run validate:complete
npm run deploy
```

## CI 检查

```bash
npm run doctor
npm run verify
npm run check:routes
npm run check:public
npm run check:seo-geo
npm run check:deployment
npm run check:migrations
npm run check:whitelabel
npm run check:contact-fields
npm run typecheck
npm test
```

GitHub Actions 只负责验证仓库完整性和部署配置；真正的 Cloudflare 发布入口是 `npm run deploy`。

## 项目结构

```text
src/                 Worker 源码
migrations/          D1 migrations
scripts/             部署与检查脚本
public/              静态资源
.github/workflows/   CI
wrangler.toml        Cloudflare 配置
CHANGELOG.md         版本记录
VERSION              当前版本
```

## 常见问题

### D1 找不到

检查当前副本：

```bash
npm run doctor
npm run verify
npm run check:deployment
npm run check:migrations
```

重点确认 `wrangler.toml` 中：

```toml
binding = "DB"
database_name = "你的当前副本数据库名"
migrations_dir = "migrations"
```

不要填入其他 Cloudflare 账号的 `database_id`。

### Worker 名称不一致

手动连接 Workers Builds 时：

```text
Cloudflare Worker name
        =
wrangler.toml -> name
```

如果已经出现名称不一致，先修正 Cloudflare 项目配置，再重新部署。

## 版本

当前版本：**v1.0.0**

详见 `CHANGELOG.md`、`docs/DEPLOYMENT.md` 和 `docs/CF-ONE-CLICK.md`。
