# Cloudflare Workers 白标 CMS

可复刻、可 Fork、可独立部署的 Cloudflare Workers CMS 基础模板。

## 全新 Cloudflare 环境部署原则

复制仓库后不需要下载 ZIP，也不需要手动创建 D1/KV/R2。

部署流程：

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
自动检查 Cloudflare 资源
        ↓
创建/绑定当前环境资源
        ↓
执行 D1 migrations
        ↓
发布 Worker
```

## D1 资源说明

D1 绑定固定使用：

```toml
binding = "DB"
```

不要在复制仓库时固定：

```toml
database_id
```

原因：

- 每个 Cloudflare 账号资源 ID 不同
- Fork 后需要独立资源
- 避免连接旧环境数据库

部署脚本负责检查当前 Cloudflare 环境的 D1 资源，并执行 migration。

## Cloudflare Workers Builds

配置：

```text
Production branch = main
Root directory = /
Build command = 留空
Deploy command = npm run deploy
Node.js = 26.10.0
```

## 自动创建资源

首次部署会初始化：

- D1 Database
- KV Namespace
- R2 Bucket
- Workers AI
- Assets

## 部署检查

执行：

```bash
npm run doctor
npm run verify
npm run deploy
```

检查：

- Node 环境
- Wrangler 配置
- Worker 配置
- D1 migrations
- 资源绑定
- 部署后健康状态

## 项目结构

```text
src/              Worker 源码
migrations/       D1 SQL migrations
scripts/          部署和检查脚本
public/           静态资源
wrangler.toml     Cloudflare 配置
```

## 白标复制规则

仓库不保存：

- Cloudflare Token
- API Key
- 生产密码
- 客户信息
- 私有配置

复制仓库后，每个环境独立部署。
