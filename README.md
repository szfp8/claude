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

## 3. 首次部署只保留必要设置

Cloudflare 创建 Worker 时不要一次填满所有第三方服务密钥。**首次部署真正建议保留的唯一 Secret 是 `SETUP_TOKEN`**，用于保护首个管理员初始化和忘记密码后的管理员恢复。

| 首次部署项目 | 是否需要 | 建议 |
|---|---:|---|
| `SETUP_TOKEN` | **建议必填** | `openssl rand -hex 32`；务必保存到密码管理器 |
| `JWT_SECRET` | 可选 | 不填时登录密钥会由 `CACHE_KV` 自动生成并保存 |
| `PBKDF2_ITERATIONS` | 可选 | 不填使用默认值；需要时可设 `100000` |
| `INDEXNOW_KEY` | 不需要 | 登录后台后到「系统设置」填写 |
| `EXTERNAL_AI_API_KEY` | 不需要 | 登录后台 →「AI 设置」填写，仅使用外部 AI 时需要 |
| `RESEND_API_KEY` | 不需要 | 登录后台 →「系统设置」填写，仅启用邮件回复时需要 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 不需要 | 登录后台 →「系统设置」填写，仅启用 Google 服务账号时需要 |

后台保存的第三方密钥不会回显，并会使用应用登录密钥加密后保存到 D1。Cloudflare Secret 仍可作为兼容兜底配置；推荐新站直接使用后台设置。

**不要把任何真实密钥提交到 GitHub。**

### 首次部署后的设置顺序

```text
Deploy to Cloudflare
  ↓
Worker / D1 / KV / R2 / AI / Assets
  ↓
只配置 SETUP_TOKEN
  ↓
打开 /admin/setup 创建唯一管理员
  ↓
进入「系统设置」填写站点主题、联系方式、IndexNow / Resend / Google（按需）
  ↓
进入「AI 设置」选择 Workers AI 或外部 AI；外部 AI 才填写 API Key
  ↓
进入「AI 提示词」统一检查默认规则和各任务提示词
  ↓
进入「统一 SEO 关键词」建立候选词与关键词矩阵
  ↓
进入「SEO / 自然收录」检查 Sitemap、Robots 和通知渠道
```

**管理员忘记密码：**登录页点击「忘记密码」，使用首次部署时保存的 `SETUP_TOKEN` 重置唯一管理员邮箱和密码。若 `SETUP_TOKEN` 遗失，可先在 Cloudflare Secret 中设置一个新的 `SETUP_TOKEN`，再使用新的令牌恢复。

## 4. 后台管理入口怎么用

首次部署完成后，后台按下面顺序设置：

| 后台入口 | 负责什么 | 首次部署是否需要 |
|---|---|---:|
| `/admin/setup` | 创建唯一管理员邮箱和密码 | **需要** |
| `/admin/users` | 修改唯一管理员邮箱/密码 | 登录后按需 |
| `/admin/recover` | 忘记密码，用 `SETUP_TOKEN` 恢复唯一管理员 | 需要恢复时 |
| `/admin/settings` | 白标主题、站点名称、服务、行业词、IndexNow、Resend、Google 等 | 登录后 |
| `/admin/ai-settings` | Workers AI / 外部 AI、模型、温度、Token、Fallback | 登录后 |
| `/admin/ai-prompts` | 全局 + 新闻/城市/服务/文章/关键词/落地页/普通页面提示词 | 登录后 |
| `/admin/keywords` | 固定候选词、机会分、矩阵、SEO 页面治理 | 登录后 |
| `/admin/seo` | Sitemap、Robots、收录通知、推送日志 | 登录后 |

### 唯一管理员与密码恢复

系统只保留一个管理员，不提供新增管理员。

- 修改密码：进入「管理用户」，修改邮箱或新密码。
- 忘记密码：登录页点击「忘记密码？」进入 `/admin/recover`，输入首次部署时保存的 `SETUP_TOKEN`，重新设置邮箱和密码。
- `SETUP_TOKEN` 不显示在后台；如果遗失，可先到 Cloudflare Worker → Settings → Variables and Secrets 设置一个新的 `SETUP_TOKEN`，再执行恢复。
- 不要为了恢复密码删除 D1 或重新部署数据库。

### AI 提示词怎么统一管理

「AI 设置」负责**AI 通道和模型参数**；「AI 提示词」负责**AI 写作规则**。

系统实际组合顺序固定为：

`默认写作底线 → 自定义补充规则 → 当前页面资料 → 当前 AI 通道`

因此一般不需要把完整系统提示词复制到每个任务里。八类任务共用统一事实边界、SEO 质检和输出格式；每个任务只补充自己的行业/业务写法。每张提示词卡都可以：

1. 查看当前默认规则；
2. 写自定义补充；
3. 测试当前生效提示词；
4. 恢复该任务的系统默认。

**AI 连通性测试成功不等于文章一定能保存**：文章/城市/服务等内容还必须通过当前任务的 JSON、HTML、结构和长度质量门槛。

### 「统一 SEO 关键词」五个按钮的区别

不要把这几个按钮当成同一个“SEO生成”按钮：

- **重新计算机会分**：只重新计算城市 × 服务关键词的机会分，不改页面 SEO。
- **🧹 选择清理生产库**：删除明确无效/重复/低质量的生产 SEO 数据；属于破坏性操作，执行前确认范围。
- **🤖 AI生成候选词**：只维护少量“全站候选词库”，供 AI 和内容规划参考，不直接覆盖页面 `seo_keywords`。
- **一键生成/更新矩阵**：根据启用城市 × 启用服务生成/更新关键词矩阵，并重新计算机会分；不负责页面标题/描述。
- **一键规范全部页面 SEO**：批量修复实际页面的 SEO 标题、描述和 3-5 个主题词；不会改写固定候选词库和关键词矩阵。

建议日常顺序：**先配置站点画像 → AI候选词 → 生成矩阵 → 核实搜索量/难度 → 重算机会分 → 生成需要的落地页 → 最后规范页面 SEO。**

### Sitemap 为什么不是“已收录内容”

`/sitemap.xml` 是给搜索引擎发现 URL 的**公开 URL 清单**，不是搜索引擎的“已收录结果”。

当前模板会把以下公开 URL 放进 Sitemap：

- 公开的首页、服务、城市、文章列表、关于、联系页面；
- **已发布**文章；
- 启用且实际由本站渲染的服务页；
- 启用城市页；
- 符合机会分门槛的城市 × 服务 SEO 落地页；
- 后台启用的子项目详情页。

因此下面这些不会因为“存在于后台”就自动进入 Sitemap：

- 草稿；
- `pending_review` 待审核文章；
- 已隐藏页面；
- 跳转外站的服务页；
- 不符合当前公开条件的低机会分落地页。

**Sitemap 里有 URL ≠ 搜索引擎已经收录。** 是否抓取、建立索引以及最终展示，由对应搜索引擎决定。后台「SEO / 自然收录」可以查看当前 Sitemap、Robots、通知渠道和推送日志；Google 普通文章建议同时在 Search Console 提交 Sitemap。

## 5. Worker 名称

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

## 6. D1 首次部署闭环

`npm run deploy` 会：

1. 检查远程 D1 是否可访问。
2. D1 尚未就绪时先发布一次 Worker，让 Cloudflare 完成资源准备。
3. 执行 `wrangler d1 migrations apply DB --remote`。
4. 再发布 Worker。
5. 执行 `npm run postdeploy:check`。

D1 binding 固定读取 `[[d1_databases]]` 的 `DB`，不会把 Assets 的 `ASSETS` 当成 D1。

如果首次部署已经创建了 Worker、KV、D1、R2，后续步骤失败时**不要删除并重新创建资源**，直接修复失败步骤后重试。

## 7. 部署后验收

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

## 8. 手动部署

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

## 9. CI

GitHub Actions 会执行脚本语法、仓库完整性、路由、白标、SEO/GEO、D1 migrations、TypeScript、测试和 Wrangler dry-run。

CI 是仓库质量闸门；Cloudflare Workers Builds 才负责生产发布。

## 10. 安全

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

## 11. 版本

当前版本：**v1.0.0**

部署相关说明统一维护在：

- `docs/CF-ONE-CLICK.md`
- `docs/DEPLOYMENT.md`
- `docs/DEPLOYMENT-ARCHITECTURE.md`
- `docs/CF-SETUP-TROUBLESHOOTING.md`

这些文档均以当前 `main` 分支代码为准。
