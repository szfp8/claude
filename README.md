# Cloudflare Workers 白标 CMS

一个可 Fork、可复制、可独立部署的 Cloudflare Workers CMS 模板。推荐通过 Cloudflare **Deploy to Cloudflare** 完成首次部署。

## 🚀 Cloudflare 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fszfp8%2Fclaude)

### 推荐部署方式

1. 点击上面的 **Deploy to Cloudflare**。
2. 连接 GitHub。
3. 选择 **创建专用 Git 存储库**，Cloudflare 会把模板复制到你的 GitHub。
4. 在「设置您的应用程序」页面配置 Worker、KV、D1、R2 和环境变量。
5. 点击 **创建和部署**。
6. Cloudflare 会执行 `npm ci`、`npm run build`、`npm run deploy`。
7. 部署脚本会检查/创建资源、执行 D1 migrations，并再次发布 Worker。
8. 部署成功后，Cloudflare Workers Builds 会继续跟踪生产分支 `main` 的推送。

标准链路：

```text
Deploy to Cloudflare
        ↓
创建 GitHub 专用副本
        ↓
配置 Worker / D1 / KV / R2 / Secrets
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

---

# 1. Cloudflare「设置您的应用程序」怎么选

## Git 帐户

选择你的 GitHub 账号，并选择：

```text
创建专用 Git 存储库
```

建议使用专用副本。Cloudflare 会把 `szfp8/claude` 复制到你的 GitHub，然后后续生产部署以这个副本为准。

## 生产分支

```text
main
```

## Root directory

```text
/
```

## Build command

```bash
npm run build
```

## Deploy command

```bash
npm run deploy
```

## Node.js

```text
26.10.0
```

仓库同时提供 `.nvmrc` 和 `package.json` engines 约束 Node 版本。

---

# 2. KV / D1 / R2 怎么选

Cloudflare 页面中的资源绑定必须对应仓库里的 binding 名称。

| Cloudflare 页面 | Binding | 用途 |
|---|---|---|
| Select KV namespace | `CACHE_KV` | 缓存 |
| Select D1 database | `DB` | CMS 数据库 |
| Select R2 bucket | `R2_MEDIA` | 媒体文件 |
| Cloudflare AI | `AI` | Workers AI |
| Assets | `ASSETS` | `public/` 静态资源 |

### D1

选择或创建一个属于**当前 Cloudflare 账号/当前副本**的 D1。

仓库模板默认：

```toml
[[d1_databases]]
binding = "DB"
database_name = "white-label-cms-db"
migrations_dir = "migrations"
migrations_pattern = "migrations/*.sql"
```

### KV

选择或创建当前账号的 KV，并绑定到：

```text
CACHE_KV
```

### R2

选择或创建当前账号的 R2，并绑定到：

```text
R2_MEDIA
```

### 读取复制

首次部署建议：

```text
启用读取复制 = 关闭
```

等生产环境稳定后，再根据实际需求启用。

---

# 3. Cloudflare 页面要求填写的环境变量

某些 Cloudflare Deploy to Cloudflare 表单会把下面项目全部标记为必填。如果 UI 强制填写，**必须全部填写才能继续创建应用**。

| 变量 | 首次部署 | 说明 |
|---|---|---|
| `JWT_SECRET` | **必填** | JWT 签名密钥，必须使用随机高强度值 |
| `SETUP_TOKEN` | **必填** | 首次管理员/初始化保护 Token，必须使用随机值 |
| `PBKDF2_ITERATIONS` | **必填** | 密码派生迭代次数；使用 `100000` |
| `INDEXNOW_KEY` | **必填** | IndexNow 验证 Key，使用随机值 |
| `EXTERNAL_AI_API_KEY` | UI 强制时填写 | 不使用外部 AI 时可先填占位值，正式使用前换成真实 API Key |
| `RESEND_API_KEY` | UI 强制时填写 | 不使用 Resend 时可先填占位值，启用邮件功能前换成真实 Key |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | UI 强制时填写 | 不使用 Google 服务时可先填占位值，启用 Google 功能前换成真实 JSON |

> **重要：** 上表中的 Secret 只应配置在 Cloudflare 的环境变量/Secret 中，**不要提交到 GitHub、`wrangler.toml` 或 README**。

## 生成随机值

JWT_SECRET：

```bash
openssl rand -hex 32
```

SETUP_TOKEN：

```bash
openssl rand -hex 32
```

INDEXNOW_KEY：

```bash
openssl rand -hex 16
```

PBKDF2：

```text
100000
```

如果 Cloudflare UI 强制要求暂时不用的可选服务变量，可以先使用明确的占位值，例如：

```text
EXTERNAL_AI_API_KEY=unused
RESEND_API_KEY=unused
GOOGLE_SERVICE_ACCOUNT_JSON=unused
```

这些占位值**不是服务凭证**；以后启用对应功能时必须替换为真实配置。

---

# 4. INDEXNOW_KEY

`INDEXNOW_KEY` 是网站用于 IndexNow URL 更新通知的验证 Key。

建议：

```bash
openssl rand -hex 16
```

然后把结果作为 Cloudflare Secret：

```text
INDEXNOW_KEY
```

如果项目要求通过 Key 文件进行验证，还需要让对应 Key 文件能够从网站根路径访问，例如：

```text
https://你的域名/<INDEXNOW_KEY>.txt
```

文件内容就是相同的 Key。

---

# 5. Worker 名称规则

这是首次部署最容易遇到的问题之一。

模板 `wrangler.toml` 默认：

```toml
name = "white-label-cms"
```

但是 Cloudflare Deploy to Cloudflare 可以为你的专用 GitHub 副本使用自己的 Worker 名称。

**不要为了名称变化而手动写死其他账号的名称。**

当前部署脚本会按以下顺序尊重 Cloudflare/Workers Builds 提供的 Worker 名称：

```text
WRANGLER_CI_OVERRIDE_NAME
        ↓
CLOUDFLARE_WORKER_NAME
        ↓
WORKER_NAME
        ↓
wrangler.toml 的 name
```

因此：

```text
Cloudflare 实际 Worker 名称
        ↓
deploy-all.mjs
        ↓
wrangler deploy --name <实际名称>
```

可以避免之前的 Worker name mismatch。

如果你**手动创建 Workers Builds**，则建议直接让 Cloudflare Worker name 与当前副本的 `wrangler.toml` `name` 保持一致。

---

# 6. D1 migrations

第一次部署时，`npm run deploy` 会：

1. 检查当前 D1 是否已经可访问。
2. 如果 D1 尚未就绪，先执行一次 Worker 部署，让 Cloudflare 完成资源配置。
3. 执行：
   ```bash
   wrangler d1 migrations apply DB --remote
   ```
4. 再发布 Worker。
5. 执行部署后检查。

### 特别注意

D1 binding 必须是：

```text
DB
```

不要把：

```text
ASSETS
CACHE_KV
R2_MEDIA
```

当成 D1。

`ASSETS` 是静态资源 binding，不是 D1。

仓库的部署脚本已经专门处理这一点，只从 `[[d1_databases]]` 区块读取 D1 binding。

---

# 7. 第一次部署失败后不要重复创建资源

如果日志已经出现类似：

```text
KV Namespace provisioned
env.DB (...) D1 Database
env.R2_MEDIA (...) R2 Bucket
Deployed white-label-cms
```

说明资源/Worker 已经创建成功。

此时如果后面的 migration 或检查失败：

**不要删除 D1、KV、R2，也不要重新创建一套资源。**

先查看失败步骤，然后直接重新部署。

---

# 8. 本次已修复的 Cloudflare 部署问题

## 问题一：Worker name mismatch

历史问题：

```text
Cloudflare Worker = claude
wrangler.toml       = white-label-cms
```

当前 `scripts/deploy-all.mjs` 会优先使用 Cloudflare 注入的 Worker name。

## 问题二：D1 migration 错把 ASSETS 当成 D1

历史错误：

```toml
[assets]
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
```

旧代码简单读取第一个 `binding`，导致执行：

```bash
wrangler d1 migrations apply ASSETS --remote
```

从而报：

```text
Couldn't find a D1 DB with the name or binding 'ASSETS'
```

当前代码只从：

```toml
[[d1_databases]]
```

区块读取 binding，因此正确执行：

```bash
wrangler d1 migrations apply DB --remote
```

---

# 9. 部署成功后检查

Cloudflare Worker URL 可以打开后，依次检查：

### Health

```text
/healthz?probe=1
```

### 管理初始化

```text
/admin/setup
```

### 检查 D1

确认 migrations 已执行完成。

### 检查后台

完成首次管理员初始化后，再进入管理后台。

---

# 10. 如果需要自定义域名

首次部署建议先确认：

```text
workers.dev
    ↓
Worker 正常
    ↓
D1 正常
    ↓
后台正常
```

确认无误后，再在 Cloudflare 中绑定自己的域名。

不要在第一次部署同时修改大量 Worker、Routes、DNS 和 Access 设置，这样更容易定位不出问题来源。

---

# 11. Cloudflare Access

第一次部署建议：

```text
使用 Cloudflare Access 保护 = 关闭
```

先确认 Worker、健康检查和管理员初始化正常。

如果之后需要保护整个后台或特定路径，再单独配置 Access。

---

# 12. Preview Builds

第一次生产部署建议：

```text
启用预览构建 = 关闭
```

生产稳定后，再根据 Git 工作流启用 Preview Builds。

---

# 13. 手动部署

如果不使用 Cloudflare 一键部署，也可以：

```bash
npm ci
npx wrangler login
npm run doctor
npm run verify
npm run validate:complete
npm run deploy
```

Cloudflare Workers Builds 的标准配置：

```text
Production branch: main
Root directory: /
Build command: npm run build
Deploy command: npm run deploy
Node.js: 26.10.0
```

---

# 14. CI / GitHub Actions

仓库的 GitHub Actions 会检查：

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
npx wrangler d1 migrations apply DB --local
npx wrangler deploy --dry-run --config wrangler.toml
```

CI 用于验证仓库和 Cloudflare 配置；真正的生产发布由 Cloudflare Workers Builds 执行：

```text
GitHub main
    ↓
Cloudflare Workers Builds
    ↓
npm run build
    ↓
npm run deploy
```

---

# 15. 安全规则

不要提交：

- Cloudflare API Token
- JWT_SECRET
- SETUP_TOKEN
- 外部 API Key
- Resend API Key
- Google Service Account JSON
- D1 account-specific `database_id`
- KV account-specific ID
- 用户数据
- 生产数据库导出

模板只保留安全的资源名称默认值。

---

# 16. 最终部署检查清单

### Cloudflare 创建阶段

- [ ] 点击 Deploy to Cloudflare
- [ ] 连接 GitHub
- [ ] 创建专用 Git 存储库
- [ ] Production branch = `main`
- [ ] Root = `/`
- [ ] Node.js = `26.10.0`
- [ ] Build = `npm run build`
- [ ] Deploy = `npm run deploy`
- [ ] KV → `CACHE_KV`
- [ ] D1 → `DB`
- [ ] R2 → `R2_MEDIA`
- [ ] Preview Builds 首次部署关闭
- [ ] Cloudflare Access 首次部署关闭

### Secret

- [ ] `JWT_SECRET`
- [ ] `SETUP_TOKEN`
- [ ] `PBKDF2_ITERATIONS=100000`
- [ ] `INDEXNOW_KEY`
- [ ] Cloudflare UI 强制时填写 `EXTERNAL_AI_API_KEY`
- [ ] Cloudflare UI 强制时填写 `RESEND_API_KEY`
- [ ] Cloudflare UI 强制时填写 `GOOGLE_SERVICE_ACCOUNT_JSON`

### 部署后

- [ ] Worker URL 正常
- [ ] `/healthz?probe=1` 正常
- [ ] D1 migrations 成功
- [ ] `DB` binding 正确
- [ ] `CACHE_KV` binding 正确
- [ ] `R2_MEDIA` binding 正确
- [ ] `/admin/setup` 正常
- [ ] 完成首次管理员初始化
- [ ] 自定义域名配置完成后再次测试

---

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

## 版本

当前版本：**v1.0.0**

详见 `CHANGELOG.md`、`docs/DEPLOYMENT.md` 和 `docs/CF-ONE-CLICK.md`.
