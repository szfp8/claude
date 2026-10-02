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

## 0. 最短一键部署

如果你只想完成第一次上线，按这 8 步即可：

1. 点击上面的 **Deploy to Cloudflare**。
2. GitHub 选择现有仓库 **`szfp8/claude`**。
3. **关闭「创建专用 Git 存储库」**，不要创建第二个代码仓库。
4. Production branch = `main`，Root = `/`，Node = `26.10.0`。
5. Build = `npm run build`，Deploy = `npm run deploy`。
6. 不要先手工创建一套同名 D1/KV/R2；本仓库的 `wrangler.toml` + `npm run deploy` 会按当前 Cloudflare 账号完成资源准备与绑定。只有 Cloudflare 页面明确要求你选择已有资源时，才选择当前账号对应资源。
7. 首次部署不需要填写任何 Secret；其他 AI、邮件、IndexNow、Google 密钥上线后按需在后台设置。
8. 部署成功后打开 `/admin/setup` 创建唯一管理员。

```text
GitHub: szfp8/claude
       ↓
Deploy to Cloudflare
       ↓
现有仓库（不创建 dedicated repo）
       ↓
DB / KV / R2 / AI / Assets
       ↓
npm ci → npm run build → npm run deploy
       ↓
D1 migrations → Worker → postdeploy check
       ↓
/admin/setup → /admin/settings → /admin/ai-settings
```

**首次部署不要填写真实的第三方服务密钥。** `INDEXNOW_KEY`、`EXTERNAL_AI_API_KEY`、`RESEND_API_KEY`、`GOOGLE_SERVICE_ACCOUNT_JSON` 均可以登录后台后再配置。

### 一键部署前必须确认的 6 件事

1. **GitHub 源码只有一个权威仓库**：使用当前 `szfp8/claude`，不要让 Cloudflare 再创建 dedicated/private mirror repository。
2. **Cloudflare 账号已连接 GitHub 且有 Workers/D1/KV/R2/AI 所需权限**；首次部署可能会要求授权或确认资源创建。
3. **Production branch 固定 `main`**，Root directory 固定 `/`，不要把项目部署到子目录。
4. **Build / Deploy 不要改成自定义命令**：分别使用 `npm run build` 和 `npm run deploy`，D1 migration 已包含在 deploy 闭环中。
5. **不要把账号专属 ID 写回 `wrangler.toml`**。仓库故意不提交 D1 `database_id`、KV ID；这样 Fork 到新 Cloudflare 账号后才能重新绑定资源。
6. **第一次部署失败不要删除已创建资源**。先看失败步骤；如果 Worker/KV/D1/R2 已创建，修复配置后直接重新执行 Deploy。

### 首次部署最容易踩的坑

| 现象 | 原因 | 处理 |
|---|---|---|
| Cloudflare 要求创建专用 Git 仓库 | 把“连接现有仓库”和“创建 dedicated repo”混在一起 | **关闭 dedicated repo**，继续使用 `szfp8/claude` |
| `npm ci` 失败 | Node 版本不一致或 lockfile 不同步 | 使用 **Node 26.10.0**，重新连接当前仓库后再部署 |
| D1 migration 失败 | 资源尚未就绪或绑定选择错误 | 不删资源；确认 `DB` binding 后重试 `npm run deploy` |
| Worker 已上线但健康检查失败 | D1/KV/R2/AI/Assets 尚未全部完成绑定 | 打开 `/healthz?probe=1`，按 `missing_tables` / bindings 排查 |
| AI 能连通但文章不能保存 | 模型输出没有满足正式内容质量门槛 | 在 AI 设置运行“城市页真实内容/文章真实内容”诊断 |
| 忘记管理员密码 | 没保存初始化令牌 | 使用首次部署时的 `SETUP_TOKEN`，不要删除 D1 |

**判断“一键部署成功”的标准不是 Cloudflare 页面显示 Deploy finished，而是同时满足：** D1 migrations 已应用、Worker 已发布、`/healthz?probe=1` 正常、`/admin/setup` 可进入。首次管理员初始化完成后，才算业务站点真正可用。

### 部署失败后的正确恢复方式

**不要因为第一次部署失败就删除 Worker、D1、KV 或 R2。** 这个部署脚本按“探测 → 首次资源准备 → migration → 再部署 → 健康检查”的闭环设计，资源已经创建后，直接修复失败项并再次执行同一个 Deploy 即可。

推荐排查顺序：

1. 先看 Cloudflare 部署日志中**第一个失败步骤**，不要只看最后一行。
2. 如果失败发生在 D1 migration，确认绑定名是 `DB`，然后直接重新部署。
3. 如果 Worker 已发布但 postdeploy 失败，先访问 `/healthz?probe=1`，确认 `d1_schema` 和五个 bindings。
4. 如果使用自定义域名、没有 workers.dev 地址，给 Workers Builds 设置 `DEPLOY_SMOKE_URL`，让同一套 postdeploy 检查继续做 HTTP 验收。
5. **不要手工把 Build 改成远程 migration，也不要把 Deploy 改成 `npx wrangler deploy`**；否则会绕过仓库的统一部署闭环。
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

**通常不需要在部署前手工创建这些资源。** `npm run deploy` 会读取 `wrangler.toml`，首次远程 D1 尚未就绪时先发布 Worker，再应用 migrations 并再次发布；后续部署复用当前账号的资源。

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

Cloudflare 创建 Worker 时不要一次填满第三方服务密钥。**当前一键部署不需要任何 Secret**；首次部署完成后直接进入 `/admin/setup` 创建唯一管理员。`SETUP_TOKEN` 仅作为可选的初始化保护/密码恢复兼容入口。

| 首次部署项目 | 是否需要 | 建议 |
|---|---:|---|
| `SETUP_TOKEN` | 可选 | 需要额外保护首次初始化或密码恢复时再配置；一键部署默认不填写 |
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
无需配置任何 Secret
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
| `/admin/geo` | llms.txt、AI 爬虫白名单、结构化数据说明 | 登录后 |
| `/admin/social` | 抖音/快手/小红书/哔哩哔哩发布包总览 | 发布文章后 |

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
- **一键补齐内容页 SEO**：补齐城市、服务、已发布文章的 SEO 标题/描述，并整理 3-5 个页面主题词；不会改写固定候选词库、Sitemap、Robots、GEO 或正文。

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

## 5. GEO / AI 搜索怎么设置

后台入口：**/admin/geo → GEO / AI 搜索**。

### 5.1 llms.txt 怎么理解

`/llms.txt` 是给 AI/Agent 快速理解站点的机器可读 Markdown 入口，不是 Sitemap，也不是“让 AI 必须引用本站”的开关。当前系统会自动生成网站名称、主题、行业、服务、城市、最新公开文章、内容可信规则以及 Sitemap 等入口。

**建议：开启。** 不需要手工复制文章到 llms.txt；站点画像和公开内容变化后，系统会动态更新。

### 5.2 AI 爬虫白名单

`/robots.txt` 默认允许普通搜索引擎和主要 AI/答案引擎访问公开内容，同时禁止 `/admin`、`/api`、`/healthz`、`/search`。

后台 GEO 页可以关闭“显式允许主要 AI/答案引擎爬虫”。关闭后仍保留普通 User-agent: * 的公开抓取规则。

**建议：如果希望做 GEO，保持开启。** robots.txt 只能控制抓取范围，不能保证 AI 搜索引用，也不能代替内容质量和站内链接。

### 5.3 结构化数据

前台模板统一输出 Organization、WebSite、WebPage；文章页输出 Article；服务页输出 Service；城市页输出 WebPage/City 语义。不要让 AI 提示词自行生成 JSON-LD；结构化数据由程序根据真实页面数据生成，避免提示词和页面内容不一致。

发布后可用 Google Rich Results Test / Search Console 检查实际页面。结构化数据帮助搜索引擎理解页面，不等于保证展示富媒体结果或提高排名。

## 6. Robots 与 Sitemap 分别怎么设置

### Robots

直接访问：`/robots.txt`

当前默认策略：

```text
公开页面       Allow
后台/API       Disallow
搜索结果页     Disallow
Sitemap        /sitemap.xml
主要 AI 爬虫   显式 Allow（GEO 开关开启时）
```

一般**不要手工改 robots.txt**。如果把公开业务目录误写成 Disallow，可能影响搜索引擎和 AI 爬虫发现页面。

### Sitemap

直接访问：`/sitemap.xml`

Sitemap 是“**允许搜索引擎发现的公开 URL 清单**”，不是“已经收录的 URL 清单”。

系统自动包含公开首页、服务、城市、已发布文章、符合机会分条件的城市×服务落地页和启用的子项目；草稿、待审核、隐藏页、外站跳转服务和不满足公开条件的低机会分页面不会进入。

日常不需要手工编辑 Sitemap。推荐：

1. 保证页面真正公开且内容完整；
2. 检查 `/sitemap.xml`；
3. Google 在 Search Console 提交一次 Sitemap；
4. 国内搜索引擎按站长平台/主动通知能力配置；
5. 新文章发布后使用后台“📣 通知搜索引擎”。

## 7. “一键补齐内容页 SEO”到底是什么

原来的按钮名称“**一键补齐全部 SEO**”容易让人误解。现在已改成更准确的 **“一键补齐内容页 SEO”**。

它做的是**数据库内容页的 SEO 元数据补齐**：

- 城市页：补 SEO title / description；
- 服务页：补 SEO title / description；
- 已发布文章：补 SEO title / description；
- 同时重新整理城市、服务、文章的 3-5 个页面主题词。

它**不会**改正文、固定候选词库、Sitemap、Robots、GEO，也不会保证搜索引擎已经收录或 AI 搜索一定引用。

所以应理解成：**“把已有公开内容页缺失/明显异常的 SEO 元数据一次补齐”**，而不是“一键完成全部 SEO 工作”。

如果需要 AI 生成正文，应使用各页面 AI 内容入口；如果需要清理低价值 AI 页面，则使用关键词/SEO 审核中的清理工具，不要把两者混在“补齐 SEO”里。

## 8. AI 设置与 AI 提示词怎么设置

### AI 设置 /admin/ai-settings

这里负责 AI 通道和运行参数：Workers AI / 第三方 OpenAI-compatible API、模型、API Key、Temperature、最大输出 Token、备用通道和总开关。

建议第一次上线先使用 Workers AI；`@cf/meta/llama-3.1-8b-instruct-fast` 可作为默认批量内容模型。Temperature 通常保持约 0.4–0.8，长内容保留较大的输出上限。

现在后台提供三种诊断：

- **基础连通性**：只证明模型能返回文本；
- **城市页真实内容**：走正式城市页生成链路；
- **文章真实内容**：走正式文章生成链路。

后两种更适合排查“AI 调用成功，但没有得到可保存内容”。

### AI 提示词 /admin/ai-prompts

这里负责**写作规则**，不是模型参数。

系统组合顺序：

```text
系统默认写作底线
  ↓
自定义补充提示词
  ↓
当前页面资料
  ↓
当前 AI 通道
```

建议全局规则写长期不变的事实边界、SEO、结构和语气；新闻/城市/服务/文章/落地页只写各自任务差异。不要复制整套默认提示词覆盖任务；保存后先测试当前生效提示词。系统会校验提示词变量，默认规则仍参与正式生成。

## 9. 国内视频/内容平台发布包在哪里

后台新增统一入口：**/admin/social → 国内内容分发**。

官网文章人工审核并发布后，系统自动生成：

- 抖音：短视频口播脚本；
- 快手：短视频口播脚本；
- 小红书：标题 + 图文笔记；
- 哔哩哔哩：专栏图文。

统一入口可以查看每篇已发布文章四个平台的状态，并进入单个平台编辑、重新生成、保存和复制。

这里的“发布包”不是第三方账号自动代发：CMS 自动生成内容，人工检查后复制，第三方平台仍按各自官方授权流程人工发布。系统不保存第三方平台登录凭据。

从“新建文章”路径直接选择发布时，也会自动生成四个平台的发布包。

## 10. 新建文章：AI、封面图和配图怎么用

### 10.1 图片
进入「内容管理 → 新建文章」：
- cover_image 可以直接填写 /media/... 或完整 HTTPS 图片地址；
- 也可以在文章编辑页直接上传 JPG / PNG / WEBP / GIF；
- 上传文件会进入 R2，并登记到媒体库；
- 上传成功页可以直接复制图片地址或正文配图 HTML；
- 正文配图可以使用生成的 <p><img ... /></p>，也可以继续通过媒体库管理。

单张文章图片限制为 5MB。删除文章时，系统会同步清理明确属于文章的本地封面对象。

### 10.2 AI 生成文章的正确发布流程

新建文章 → 填写标题/摘要/分类/图片（可选） → AI生成正文+SEO → 待审核 → 人工检查 → 保存修改 → 发布并生成前台页面。

AI 不绕过人工审核直接公开。AI 生成内容不是“不能发布”，而是“先审核，再发布”。

- 发布并生成前台页面会重新补齐 slug、SEO 和内容卡；
- 空正文会尝试 AI 补齐，但仍按审核流程处理；
- AI 优化已发布文章时，会先撤回到待审核，避免 AI 修改后直接覆盖线上内容；
- 审核通过后可以正常发布。

如果 AI 测试只返回 OK，不能证明文章生成可保存。模型/提示词修改后，应在「AI 设置」运行“城市页真实内容”或“文章真实内容”诊断。

### 10.3 行业关键词自动识别
在「AI 提示词」页面提供“自动识别并设置行业关键词”。

它会综合站点名称、主题、行业、核心服务、已有核心/行业关键词、最近已发布文章标题/摘要/正文片段，以及已启用服务名称和摘要，然后 AI 只提取能够由现有公开内容证明的行业主题、业务场景、用户问题和核心实体词，并写入「系统设置 → 行业关键词」。

建议先完善站点画像和服务，再执行自动识别；生成后人工检查。行业关键词会自动进入后续 AI 内容上下文，但不会直接覆盖每个页面的 3–5 个 SEO 主题词。

## 11. 所有页面应该静态还是动态？
本项目推荐：**动态页面 + 缓存，而不是把 CMS 内容预生成成静态 HTML。**

原因是本项目是 Cloudflare Workers CMS：后台修改文章、城市、服务后希望立即生效；SEO 字段会动态变化；Sitemap、Robots、llms.txt 是动态数据；AI 内容和审核状态来自 D1；GEO 与结构化数据也需要根据当前页面资料生成。

推荐架构：D1 / R2 / Settings → Cloudflare Worker 动态渲染 → HTML + SEO + Schema + GEO → KV / Cache → 搜索引擎 / 用户 / AI 爬虫。

不要为了 SEO 把所有页面硬编码成静态文件。关键是稳定 URL、正确 canonical、可抓取正文、结构化数据、Sitemap 和合理缓存。

### 哪些内容适合静态
- CSS / JS；
- favicon、logo 等固定前端资源；
- 不依赖 D1 的固定文件。

### 哪些内容应该动态
- 首页；
- 城市页；
- 服务页；
- 文章页；
- 城市×服务落地页；
- /sitemap.xml；
- /robots.txt；
- /llms.txt；
- 后台管理页面；
- AI 生成/审核后的内容。

### SEO 性能优化
不要把“静态化”当成唯一性能方案。优先保持页面服务端渲染、使用已有 KV/Worker Cache、内容变更后主动清理缓存、图片放 R2、CSS/JS 等固定资源走 Assets，并让 Sitemap/Robots/llms.txt 按变更主动清理。
## 12. Worker 名称

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

## 13. D1 首次部署闭环

`npm run deploy` 会：

1. 检查远程 D1 是否可访问。
2. D1 尚未就绪时先发布一次 Worker，让 Cloudflare 完成资源准备。
3. 执行 `wrangler d1 migrations apply DB --remote`。
4. 再发布 Worker。
5. 执行 `npm run postdeploy:check`。

D1 binding 固定读取 `[[d1_databases]]` 的 `DB`，不会把 Assets 的 `ASSETS` 当成 D1。

如果首次部署已经创建了 Worker、KV、D1、R2，后续步骤失败时**不要删除并重新创建资源**，直接修复失败步骤后重试。

## 14. 部署后验收

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

## 15. 手动部署

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

## 16. CI

GitHub Actions 会执行脚本语法、仓库完整性、路由、白标、SEO/GEO、D1 migrations、TypeScript、测试和 Wrangler dry-run。

CI 是仓库质量闸门；Cloudflare Workers Builds 才负责生产发布。

## 17. 安全

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

## 18. 仓库完整性与自动化运行边界

本仓库已经按“代码入口 → D1 迁移 → 后台路由 → AI 采集/生成 → 人工审核 → 正式发布 → SEO/GEO → Cloudflare 部署 → GitHub Actions”做过一次完整性巡检。

### 已确认的核心约束

- **唯一生产代码源**：`main` 分支；不依赖第二个专用 GitHub 仓库。
- **部署入口唯一**：`npm run deploy`；D1 远程迁移不放在 `npm run build` 中执行。
- **资源 ID 不硬编码**：D1 / KV 使用 Cloudflare 部署阶段的绑定资源，不提交账号级 ID。
- **文章状态闭环**：`draft → pending_review → published`；AI 采集和 AI 生成默认不能直接公开。
- **新闻去重**：以来源 URL 为第一层幂等键，定时任务另有短期 KV 锁，减少重复 Cron 执行。
- **公开页面动态渲染**：D1/R2/Settings → Worker SSR → Cache；不把 CMS 数据复制成一套静态 HTML。
- **后台写操作使用 POST**：删除、生成、审核、发布、采集等变更操作不通过 GET 链接执行。
- **验证链完整**：仓库完整性、路由、公开路由、SEO/GEO、白标、联系方式、部署配置、迁移、TypeScript、测试和 Wrangler dry-run 均纳入 CI。

### 新闻定时采集的时间规则

Cloudflare Cron 当前每 5 分钟触发一次，而 Cron 调度本身按 UTC 执行。后台的“每天北京时间”是业务时间，因此 Worker 会把 UTC 转成北京时间，并接受配置时间之后 **0–4 分钟内的第一个 Cron tick**。

例如：

```text
后台配置 08:00 → 08:00 触发
后台配置 08:02 → 08:05 触发
后台配置 08:05 → 08:05 触发
后台配置 23:59 → 次日 00:00 触发
```

定时采集每轮仍只处理当前最需要抓取的一个来源和最新候选文章，以控制 Workers AI、外部请求和 CPU 开销；多个来源不会在一次 Cron 中无限并发。需要立即处理某个来源时，使用 `/admin/news-sources` 的“立即抓取”。

定时采集成功也**不等于自动发布**：AI 文章必须先进入 `pending_review`，管理员审核通过后才进入 `published`，随后才执行缓存清理、Sitemap/搜索引擎通知和其他已配置的发布后动作。

### 不做的“清理”

巡检不会因为文件数量多就删除代码。历史 D1 migration、`.nvmrc`、`.node-version`、路由快照、CI 校验脚本、公开/部署检查脚本只要仍被代码或发布流程引用，就保留。只有确认无引用、无运行职责的遗留入口才应删除。

### 修改后建议执行

```bash
npm ci
npm run validate:complete
npx wrangler d1 migrations apply DB --local
npx wrangler deploy --dry-run --config wrangler.toml
```

Cloudflare Cron 也可以本地通过 Wrangler 的 scheduled 测试入口验证；生产环境则以 Worker 的 Cron Events / Logs 和后台 `/admin/collection-logs` 为准。

## 19. 版本

当前版本：**v1.0.1**

部署相关说明统一维护在：

- `docs/CF-ONE-CLICK.md`
- `docs/DEPLOYMENT.md`
- `docs/DEPLOYMENT-ARCHITECTURE.md`
- `docs/CF-SETUP-TROUBLESHOOTING.md`

这些文档均以当前 `main` 分支代码为准。
