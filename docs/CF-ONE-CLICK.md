# Cloudflare 直接连接现有仓库部署说明

本说明对应 Cloudflare **Workers Builds → Import a repository**。本仓库要求直接连接现有 GitHub 仓库 `szfp8/claude`，不创建第二个 GitHub/GitLab 仓库。

## 1. Git 仓库

本仓库使用**现有 GitHub 仓库作为唯一代码源**：

```text
szfp8/claude
```

正确入口：Cloudflare Dashboard → Workers & Pages → Create application → **Import a repository** → GitHub → `szfp8/claude`。不要使用 Deploy to Cloudflare Button 作为本项目入口，因为该入口会克隆源仓库并创建新的仓库。

不要再创建 `white-label-cms` 之类的第二份 GitHub 仓库，否则会产生两个代码源，后续修改容易部署错仓库。

## 2. 应用设置

| 字段 | 值 |
|---|---|
| Git 帐户 | GitHub |
| 创建专用 Git 存储库 | **关闭** |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Node.js | `26.10.0` |
| 启用读取复制 | 关闭 |
| 启用预览构建 | 首次部署关闭 |
| Cloudflare Access | 首次部署关闭 |

## 3. 资源

选择当前 Cloudflare 账号中的资源，并按下面名称绑定：

| 资源 | Binding |
|---|---|
| KV | `CACHE_KV` |
| D1 | `DB` |
| R2 | `R2_MEDIA` |
| Workers AI | `AI` |
| Assets | `ASSETS` |

通常让当前 Deploy 流程按仓库模板准备资源即可；如果 Cloudflare 页面明确要求选择已有资源，只选择当前账号中的对应资源，并保持上述 Binding 名称不变。

**不要把其他账号的 database ID、KV ID 写进仓库。**

## 4. 首次部署 Secret 与后台配置

首次部署不要把所有第三方服务密钥都塞进 Cloudflare。

**首次部署 Secret：**

```text
无需填写任何 Secret
```

首次部署完成后直接打开 `/admin/setup` 创建唯一管理员。`SETUP_TOKEN` 仅作为可选的初始化保护/密码恢复兼容入口。

以下变量都是可选：

| 变量 | 首次部署 | 后台配置 |
|---|---|---|
| `JWT_SECRET` | 可选 | 不需要；留空时由 `CACHE_KV` 自动生成 |
| `PBKDF2_ITERATIONS` | 可选 | 不需要；留空使用默认值 |
| `INDEXNOW_KEY` | 不需要 | 系统设置 |
| `EXTERNAL_AI_API_KEY` | 不需要 | AI 设置；只使用外部 AI 时填写 |
| `RESEND_API_KEY` | 不需要 | 系统设置；启用邮件回复时填写 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 不需要 | 系统设置；启用 Google 服务账号时填写 |

后台保存的可选服务密钥不会回显，并会加密保存。Cloudflare Secret 仍可作为兼容兜底。

**不要提交真实 Secret 到 GitHub。**

## 5. 一键部署链路

Cloudflare Workers Builds 使用：

```text
npm ci
  ↓
npm run build
  ↓
npm run deploy
  ↓
D1 migrations
  ↓
Worker deploy
  ↓
postdeploy:check
```

`npm run deploy` 是仓库唯一生产部署入口。

## 6. D1 首次部署

`scripts/deploy-all.mjs` 会专门读取：

```toml
[[d1_databases]]
binding = "DB"
```

不会读取 Assets 的：

```toml
[assets]
binding = "ASSETS"
```

因此不会再次出现：

```text
Couldn't find a D1 DB with the name or binding 'ASSETS'
```

如果第一轮已经创建 Worker/KV/D1/R2，后续失败时不要删除资源，直接重试部署。

## 7. 部署后验收

访问：

```text
/healthz?probe=1
```

确认：

```text
DB=true
CACHE_KV=true
R2_MEDIA=true
AI=true
ASSETS=true
d1_schema=true
missing_tables=[]
```

然后：

```text
/admin/setup
/admin/settings
```

完成初始化。

