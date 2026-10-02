# 仓库完整性与工作流说明

对应 `main` 当前代码（含 CI 修复）。

## 1. GitHub Actions

| 工作流 | 文件 | 触发 | 作用 |
|--------|------|------|------|
| Validate Cloudflare Worker | `.github/workflows/deploy.yml` | `push`/`PR` → `main`，手动 | 语法、路由/SEO/白标契约、部署配置、migrations、`tsc`、单元测试、D1 local migrate、`wrangler deploy --dry-run` |

### CI 步骤（validate）

```text
npm ci
→ node --check scripts/*.mjs
→ check:routes / check:public / check:seo-geo / check:whitelabel
→ 禁止 admin 危险 GET 变更链接
→ check:deployment / check:migrations
→ npm run build（tsc）
→ npm test
→ wrangler d1 migrations apply DB --local
→ wrangler deploy --dry-run
```

Node：**26.10.0**（`.node-version` / `.nvmrc`）。

查看：https://github.com/szfp8/claude/actions

### 已修复的 CI 问题

| 现象 | 原因 | 处理 |
|------|------|------|
| Unit tests | `auth.ts` 导入 `./password` 无扩展名，Node ESM 失败 | 在 `auth.ts` **内联** `timingSafeEqual` |
| Build (tsc) | 曾改为 `./password.ts`，Bundler 解析报错 | 同上，去掉相对导入 |

Actions **只做校验**，不部署生产；生产靠 Cloudflare Workers Builds / Dashboard。仓库当前仅保留 `.github/workflows/deploy.yml`。

---

## 2. 代码完整性清单

| 项 | 状态 | 说明 |
|----|------|------|
| 入口 | ✅ | `src/index.ts` |
| D1 migrations | ✅ | 当前 `migrations/` 全部迁移文件 |
| 绑定 | ✅ | DB / CACHE_KV / R2_MEDIA / AI / ASSETS |
| `[build]` | ✅ | `npm run build`；远程 D1 migration 由 `deploy-all.mjs` 单一路径处理 |
| 白标内容 | ✅ | 行业/站点主题来自设置，不绑定财税模板；`check:whitelabel` 扫描遗留行业词/域名 |
| JWT | ✅ | 可留空，CACHE_KV 自动生成 |
| 一键 CF | ✅ | Secret 可全空（`docs/CF-ONE-CLICK.md`） |
| Contact Channels | ✅ | Header / Footer / Contact / AI / GEO 输出统一读取 `contact_channels`，显式空配置保持为空 |
| AI Provider | ✅ | Workers AI / OpenAI-compatible + 可选 fallback；外部 Base URL 强制 HTTPS 并拒绝常见内网地址 |\n| SEO/GEO 发布闭环 | ✅ | pending_review → 人工审核 → published → Sitemap / 百度通知 / IndexNow / 内容发布包 |\n| 单元测试 | ✅ | `tests/*.test.ts` |

---

## 3. 文档索引

| 文档 | 用途 |
|------|------|
| `README.md` | 总览 |
| `docs/CF-ONE-CLICK.md` | 一键向导 |
| `docs/DEPLOYMENT.md` | 部署验收 |
| `docs/CF-SETUP-TROUBLESHOOTING.md` | 排障 |
| `docs/AUDIT-STATUS.md` | 需求完成度 |
| `docs/MIGRATIONS.md` | 迁移 |
| `docs/INTEGRITY.md` | 本文 |

---

## 4. 本地等价校验（可选）

```bash
npm ci
npm run check:deployment && npm run check:migrations
npm run check:routes && npm run check:public
npm run check:seo-geo && npm run check:whitelabel
npm run build && npm test
```


## 5. 本轮源码完整性修复（2026-10-01）

本轮不是 README-only 修改，实际代码变更如下：

- `src/routes/seo.ts`：`/llms.txt` 的公开联系方式改为从统一 Contact Channels accessor 读取；没有配置时明确输出“当前未配置公开联系方式”，不再直接读取 `contact_phone`。
- `src/utils/aiPrompts.ts`：AI 系统联系方式只使用 canonical `contact_channels`；当后台明确保存空渠道时，不再从旧 `contact_qr_url` 回填二维码，保持“空配置即无联系方式”的白标语义。
- `scripts/check-deployment.mjs`：移除已删除的 `try-remote-migrate.mjs` 依赖检查。
- `scripts/postdeploy-check.mjs`：HTTP 验收明确要求 DB、KV、R2、AI、ASSETS 五个 Worker binding 全部存在。

### 当前源码闭环

```text
站点设置 / Branding / Contact Channels
        ↓
前台 Header / Footer / Contact
        ↓
AI Prompt 官方联系方式上下文
        ↓
SEO / GEO（sitemap / robots / llms / ai-index）
        ↓
AI 生成 → pending_review
        ↓
人工审核 → published
        ↓
Sitemap + 百度普通收录通知 + IndexNow
        ↓
国内内容/视频发布包
```

说明：搜索引擎或 AI 平台是否最终抓取、收录或引用由对应平台决定；代码只保证公开页面、结构化数据、Sitemap、通知任务和人工审核边界的闭环，不把“提交成功”等同于“已收录”。
