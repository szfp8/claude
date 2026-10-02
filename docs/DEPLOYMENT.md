# Cloudflare 白标 CMS 部署说明

版本：`1.0.1`  
Worker 默认名：`white-label-cms`  
Node：`26.10.0`

## 1. 仓库完整性

本仓库已经包含：

- Worker 入口、路由、中间件和业务模块
- 全部 D1 migrations
- KV / D1 / R2 / AI / Assets 配置
- Cloudflare 一键部署入口
- D1 远程 migration 自动执行
- 部署后健康检查
- GitHub Actions 完整校验
- 测试、TypeScript 和 Wrangler dry-run

仓库不包含任何账号专属 Cloudflare ID，也不包含生产 Secret。

## 2. Cloudflare 一键部署

使用 Cloudflare Dashboard → Workers & Pages → Create application → **Import a repository**，连接 GitHub 并选择现有 `szfp8/claude`。不要创建第二个 GitHub/GitLab 仓库。

### 必须这样选

```text
GitHub                    = 当前 GitHub
Git repository            = szfp8/claude
Production branch         = main
Root directory            = /
Build command             = npm run build
Deploy command            = npm run deploy
Node.js                   = 26.10.0
读取复制                  = 关闭
Preview Builds            = 首次关闭
Cloudflare Access         = 首次关闭
```

**本仓库只有一个权威 Git 源，不创建第二个 dedicated repository。**

## 3. 绑定

```text
KV       → CACHE_KV
D1       → DB
R2       → R2_MEDIA
AI       → AI
Assets   → ASSETS
```

模板默认：

```toml
name = "white-label-cms"
main = "src/index.ts"

[[d1_databases]]
binding = "DB"
database_name = "white-label-cms-db"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "CACHE_KV"

[[r2_buckets]]
binding = "R2_MEDIA"
bucket_name = "white-label-cms-r2-media"

[ai]
binding = "AI"
```

不提交 `database_id`、KV `id` 等账号专属 ID。

## 4. Secrets

首次部署不需要填写任何 Secret。`SETUP_TOKEN` 仅作为可选的初始化保护与密码恢复入口：

```bash
openssl rand -hex 32
```

以下配置按需使用，第三方密钥推荐在后台配置，而不是阻塞第一次部署：

- `JWT_SECRET`：可选；留空时由 `CACHE_KV` 自动生成。
- `PBKDF2_ITERATIONS`：可选；留空使用默认值。
- `INDEXNOW_KEY`：后台「系统设置」按需配置。
- `EXTERNAL_AI_API_KEY`：后台「AI 设置」按需配置。
- `RESEND_API_KEY`：后台「系统设置」按需配置。
- `GOOGLE_SERVICE_ACCOUNT_JSON`：后台「系统设置」按需配置。

真实 Secret 只进入 Cloudflare，不进入 GitHub。

## 5. 自动部署闭环

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
再次部署 Worker
        ↓
npm run postdeploy:check
        ↓
Worker Online
```

如果第一轮已经创建资源，不要删除资源重来。

## 6. 部署后

访问：

```text
/healthz?probe=1
```

要求：

```text
ok=true
DB=true
CACHE_KV=true
R2_MEDIA=true
AI=true
ASSETS=true
d1_schema=true
missing_tables=[]
```

然后访问：

```text
/admin/setup
/admin/settings
```

## 7. 手动部署

如需本地验证：

```bash
npm ci
npx wrangler login
npm run doctor
npm run verify
npm run validate:complete
npm run deploy
```

手动路径与 Cloudflare Workers Builds 使用同一个 `npm run deploy`，不会产生第二套部署逻辑。

## 8. CI

`.github/workflows/deploy.yml` 是唯一权威验证 Workflow，负责：

- Node / 脚本语法
- 仓库完整性
- 路由与白标
- SEO/GEO
- D1 migrations
- TypeScript
- 测试
- Wrangler dry-run

CI 不替代 Cloudflare 生产发布。

## 9. 安全

禁止提交：

- API Token
- Secret
- Google Service Account JSON
- 账号专属 D1/KV ID
- 生产数据库导出
- 用户数据
