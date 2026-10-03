# Cloudflare Workers 白标 CMS

一个基于 Cloudflare Workers + D1 + KV + R2 + Workers AI + Assets 的无服务器白标 CMS。生产代码源只有当前 GitHub 仓库 `szfp8/claude`，Cloudflare Workers Builds 直接跟踪 `main`。

## 当前状态

- **生产分支**：`main`
- **Node.js**：`26.10.0`（`.nvmrc`、`.node-version`、`package.json` 三处一致）
- **Hono**：`4.13.11`
- **部署入口**：`npm run deploy`
- **健康检查**：`/healthz?probe=1`
- **CI**：GitHub Actions 在 push/PR 上执行完整仓库校验
- **数据库迁移**：D1 migrations 按文件名顺序追加，历史 migration 不改名、不删除

## 推荐部署方式

直接在 Cloudflare Dashboard 中连接现有 GitHub 仓库：

```text
Workers & Pages
  → Create application
  → Import a repository
  → GitHub
  → szfp8/claude
```

Workers Builds 建议：

| 项目 | 设置 |
|---|---|
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Node.js | `26.10.0` |

本项目不要求 Cloudflare 创建第二个 GitHub/GitLab 仓库。**不要把 Deploy to Cloudflare Button 的“复制仓库”流程当成生产部署入口。**

### Cloudflare 资源绑定

| 资源 | Binding | 用途 |
|---|---|---|
| D1 | `DB` | CMS 数据 |
| KV | `CACHE_KV` | 缓存、限流、会话密钥 |
| R2 | `R2_MEDIA` | 媒体文件 |
| Workers AI | `AI` | AI 能力 |
| Assets | `ASSETS` | `public/` 静态资源 |

仓库不提交账号专属 D1 `database_id` 或 KV ID；资源配置以 `wrangler.toml` 为准。

## 首次部署

首次部署**不需要填写任何第三方 Secret**。

1. 连接 `szfp8/claude`，分支选择 `main`。
2. Build 使用 `npm run build`，Deploy 使用 `npm run deploy`。
3. 首次部署脚本按以下顺序处理：
   ```text
   predeploy
      ↓
   Worker deploy（准备资源）
      ↓
   D1 migrations --remote
      ↓
   最终 Worker deploy
      ↓
   postdeploy:check
   ```
4. 部署完成后访问 `/healthz?probe=1`。
5. 打开 `/admin/setup` 创建唯一管理员。
6. 再进入后台按需配置站点、SEO/GEO、AI、邮件和搜索引擎通知。

### Secret / 环境变量

| 配置 | 首次部署 | 说明 |
|---|---:|---|
| `SETUP_TOKEN` | 可选 | 不填写也可以直接进入 `/admin/setup`；需要密码恢复保护时再配置 |
| `JWT_SECRET` | 可选 | 不填写时使用 `CACHE_KV` 自动生成并持久化的会话密钥 |
| `PBKDF2_ITERATIONS` | 可选 | 使用应用默认值即可 |
| `SITE_URL` | 可选 | 后台系统设置优先；留空时按当前访问域名兜底 |
| `INDEXNOW_KEY` | 按需 | 可在后台系统设置配置 |
| `EXTERNAL_AI_API_KEY` | 按需 | 仅使用外部 AI 时需要 |
| `RESEND_API_KEY` | 按需 | 仅启用邮件回复时需要 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 按需 | 仅启用 Google 服务时需要 |

**任何真实密钥都不要提交到 GitHub。**

## 本地开发

需要 Node.js `26.10.0`：

```bash
npm ci
npm run doctor
npm run dev
```

本地 Secret 使用未提交的 `.dev.vars`；仓库只提供 `.dev.vars.example`。

常用命令：

```bash
npm run typecheck
npm test
npm run verify
npm run validate:complete
npm run db:migrate:local
npx wrangler deploy --dry-run --config wrangler.toml
```

## 验证与 CI

`npm run validate:complete` 是仓库级完整验证入口，覆盖：

- 本地环境与必需文件检查
- 仓库完整性
- Admin / public 路由检查
- SEO / GEO 检查
- 白标配置检查
- 联系方式字段检查
- Cloudflare / Cron / binding 配置检查
- D1 migration 命名检查
- TypeScript 类型检查
- Node 测试
- Wrangler dry-run

GitHub Actions 与本地验证保持同一套规则。当前 workflow **只负责验证，不执行生产部署**；Cloudflare Workers Builds 负责生产部署。

## 认证与安全边界

- 后台登录使用 HttpOnly + Secure + SameSite Cookie。
- 登录密码使用 PBKDF2；旧哈希在成功登录后按策略升级。
- JWT 会话绑定当前密码哈希指纹，修改/恢复密码后旧会话失效。
- 登录存在 KV 限流/失败计数。
- 管理写操作使用 POST，不使用 GET 触发删除、生成、审核等变更。
- 上传文件执行实际文件类型校验，不只信任浏览器提交的 MIME。
- 媒体通过 R2 binding 提供，公开读取路径经过 key 边界校验。
- 系统不提供 D1/R2/KV 的全站“一键清空”。

## D1 migrations 规则

`migrations/` 是生产数据库历史的一部分：

- 新 migration 只能追加新的编号。
- 已执行 migration **不要重命名、删除或重新排序**。
- 当前存在两个 `0003_*.sql` 是历史兼容状态；`0003_media_assets.sql` 是历史 marker，真正创建 `media_assets` 表的是 `0008_media_assets.sql`。
- `scripts/check-migrations.mjs` 已显式允许这个历史重复编号，并阻止新的重复编号。

因此，不要为了“目录看起来连续”而删除 `0003_media_assets.sql`。

## 仓库结构

```text
.
├── .github/workflows/       # GitHub CI
├── migrations/              # D1 历史迁移，只追加
├── public/                  # Workers Assets
├── scripts/                 # doctor / verify / deploy / CI 检查
├── src/
│   ├── middleware/          # 认证、限流等中间件
│   ├── modules/             # 业务模块
│   ├── routes/              # admin / api / public / seo
│   ├── services/            # 定时/后台服务
│   ├── templates/           # HTML/UI 模板
│   └── utils/               # 认证、AI、SEO、站点设置等工具
├── tests/                   # Node 测试
├── package.json             # npm scripts / 依赖
├── wrangler.toml            # Cloudflare bindings
└── README.md
```

## 清理原则

本次整理只删除已经确认没有独立价值的重复入口：

- 删除与 README 重复的 `QUICK-START.md`，部署说明统一到 README 和 `docs/`。
- 保留 `.nvmrc` 与 `.node-version`：两者内容一致，但分别兼容不同 Node 版本管理器和 CI/本地工具。
- 保留 `CHANGELOG.md`、`VERSION`、`tests/`、CI 检查脚本和部署脚本。
- 保留全部历史 D1 migrations，即使其中有 marker 或兼容迁移。
- 不提交 `node_modules/`、`.wrangler/`、`dist/`、本地环境变量和系统文件。

## 内容、新闻与 SEO/GEO

文章发布遵循：

```text
draft → pending_review → published
```

AI 生成内容默认先进入人工审核，不直接公开。

Cloudflare Cron 当前每 5 分钟运行一次；后台配置的北京时间会转换到最近的 Cron tick。公开 Sitemap、Robots、llms.txt、结构化数据和通知渠道由 Worker 动态生成，只有符合公开条件的页面进入公开 URL 清单。

## 故障排查

### D1 migration 失败

不要删除已经创建的 Worker、D1、KV 或 R2。先处理日志中的第一个错误，再重新执行：

```bash
npm run deploy
```

### Worker 已部署但健康检查失败

检查：

```text
/healthz?probe=1
```

重点确认 `DB`、`CACHE_KV`、`R2_MEDIA`、`AI`、`ASSETS` 以及 `d1_schema`。

### 管理员忘记密码

如果配置了 `SETUP_TOKEN`，通过 `/admin/recover` 恢复。若未配置，可在 Cloudflare Worker → Settings → Variables and Secrets 新增一个新的 `SETUP_TOKEN` 后再恢复；不要删除数据库。

## 相关文档

- [Cloudflare 一键部署](docs/CF-ONE-CLICK.md)
- [部署说明](docs/DEPLOYMENT.md)
- [部署架构](docs/DEPLOYMENT-ARCHITECTURE.md)
- [Cloudflare 排错](docs/CF-SETUP-TROUBLESHOOTING.md)
- [D1 migrations](docs/MIGRATIONS.md)
- [后台模块](docs/ADMIN-MODULES.md)
- [完整性说明](docs/INTEGRITY.md)

## 版本

当前版本：**v1.0.1**
