# Cloudflare Workers 白标 CMS

一个可直接连接到 Cloudflare、可 Fork、可独立部署的 Cloudflare Workers CMS。仓库本身包含 Worker 源码、D1 migrations、KV/R2/AI/Assets 绑定、部署脚本、健康检查、CI 和完整部署说明。

## 🚀 一键部署到 Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fszfp8%2Fclaude)

### 本仓库的正确方式

**不要创建新的专用 Git 存储库。**

如果 Cloudflare 页面出现：

> 创建专用 Git 存储库

请保持**关闭/不勾选**，直接连接现有仓库：

`szfp8/claude`

这样 GitHub 仓库只有一个权威来源，Cloudflare Workers Builds 直接跟踪 `main`。

标准链路：

```text
szfp8/claude
    ↓
Deploy to Cloudflare
    ↓
连接现有 GitHub 仓库
    ↓
配置 Worker / D1 / KV / R2 / Secrets
    ↓
npm ci
    ↓
npm run build
    ↓
npm run deploy
    ↓
D1 migrations
    ↓
postdeploy health check
    ↓
Worker Online
```

## 1. Cloudflare「设置您的应用程序」

| 项目 | 设置 |
|---|---|
| Git 帐户 | 连接 GitHub |
| 创建专用 Git 存储库 | **关闭** |
| Git 仓库 | `szfp8/claude` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Node.js | `26.10.0` |
| 启用读取复制 | 首次部署关闭 |
| 启用预览构建 | 首次部署关闭 |
| Cloudflare Access | 首次部署关闭 |

仓库同时提供 `.nvmrc`、`.node-version` 和 `package.json` engines 约束 Node 版本。

## 2. Cloudflare 资源绑定

绑定名称必须与 `wrangler.toml` 一致：

| Cloudflare 资源 | Binding | 用途 |
|---|---|---|
| KV | `CACHE_KV` | 缓存、限流、JWT 自动密钥 |
| D1 | `DB` | CMS 数据库 |
| R2 | `R2_MEDIA` | 媒体文件 |
| Workers AI | `AI` | AI 内容能力 |
| Assets | `ASSETS` | `public/` 静态资源 |

模板不提交任何账号专属 D1 `database_id` 或 KV ID。

## 3. 首次部署 Secrets

这些值不能安全地提交进 GitHub，因此由 Cloudflare 创建页面填写。

建议：

| Secret | 值 |
|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` 生成的随机值 |
| `SETUP_TOKEN` | `openssl rand -hex 32` 生成的随机值 |
| `PBKDF2_ITERATIONS` | `100000` |
| `INDEXNOW_KEY` | `openssl rand -hex 16` 生成的随机值 |
| `EXTERNAL_AI_API_KEY` | 不使用外部 AI 时可填 `unused` |
| `RESEND_API_KEY` | 不使用邮件时可填 `unused` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 不使用 Google 时填 `{}` |

其中后三项是可选服务配置；如果 Cloudflare UI 强制显示为必填，先使用占位值即可，但启用对应功能前必须替换为真实配置。

**不要把这些值提交到 GitHub。**

## 4. Worker 名称

`wrangler.toml` 默认：

```toml
name = "white-label-cms"
```

如果 Cloudflare Workers Builds 注入了 Worker 名称，部署脚本会按以下优先级使用：

```text
WRANGLER_CI_OVERRIDE_NAME
→ CLOUDFLARE_WORKER_NAME
→ WORKER_NAME
→ wrangler.toml name
```

因此不要为了某个账号手工写入账号专属名称。

## 5. D1 首次部署闭环

`npm run deploy` 会：

1. 检查远程 D1 是否可访问。
2. D1 尚未就绪时先发布一次 Worker，让 Cloudflare 完成资源准备。
3. 执行 `wrangler d1 migrations apply DB --remote`。
4. 再发布 Worker。
5. 执行 `npm run postdeploy:check`。

D1 binding 固定读取 `[[d1_databases]]` 的 `DB`，不会把 Assets 的 `ASSETS` 当成 D1。

如果首次部署已经创建了 Worker、KV、D1、R2，后续步骤失败时**不要删除并重新创建资源**，直接修复失败步骤后重试。

## 6. 部署后验收

访问：

```text
/healthz?probe=1
```

应看到：

```text
ok = true
DB = true
CACHE_KV = true
R2_MEDIA = true
AI = true
ASSETS = true
d1_schema = true
missing_tables = []
```

然后打开：

```text
/admin/setup
```

完成首次管理员初始化，再进入：

```text
/admin/settings
```

配置站点信息。

## 7. 手动部署

仓库已经包含完整手动入口，但它与 Cloudflare 一键部署使用同一套代码：

```bash
npm ci
npx wrangler login
npm run doctor
npm run verify
npm run validate:complete
npm run deploy
```

Cloudflare Workers Builds 生产发布只需要：

```text
Build command  = npm run build
Deploy command = npm run deploy
```

## 8. CI

GitHub Actions 会执行脚本语法、仓库完整性、路由、白标、SEO/GEO、D1 migrations、TypeScript、测试和 Wrangler dry-run。

CI 是仓库质量闸门；Cloudflare Workers Builds 才负责生产发布。

## 9. 安全

不要提交：

- Cloudflare API Token
- JWT_SECRET
- SETUP_TOKEN
- 外部 API Key
- Resend API Key
- Google Service Account JSON
- D1 account-specific database_id
- KV account-specific ID
- 用户数据
- 生产数据库导出

## 10. 版本

当前版本：**v1.0.0**

部署相关说明统一维护在：

- `docs/CF-ONE-CLICK.md`
- `docs/DEPLOYMENT.md`
- `docs/DEPLOYMENT-ARCHITECTURE.md`
- `docs/CF-SETUP-TROUBLESHOOTING.md`

这些文档均以当前 `main` 分支代码为准。
