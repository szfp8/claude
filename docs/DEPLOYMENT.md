# Cloudflare 白标 CMS 部署说明

版本：`0.4.4+`（与 `package.json` / `main` 对齐）  
Worker 默认名：`white-label-cms`；复制部署可通过 `CLOUDFLARE_WORKER_NAME` / Workers Builds 目标 Worker 覆盖  
Node：`26.10.0`（`.nvmrc` / `.node-version` / `engines.node`）

相关文档：`README.md` · `docs/CF-ONE-CLICK.md`（向导逐项填写） · `docs/CF-SETUP-TROUBLESHOOTING.md` · `docs/AUDIT-STATUS.md` · `docs/MIGRATIONS.md`

**语言：** 仅中文前台（无 English）。

---

## 0. 部署前完整性清单（仓库已就绪项）

| 检查项 | 状态 |
|--------|------|
| 入口 `src/index.ts` + 路由 / 中间件 / 模块 | ✅ |
| D1 migrations `0001`–`0019`（含白标空站） | ✅ |
| 绑定：DB / CACHE_KV / R2_MEDIA / AI / ASSETS | ✅ |
| `[build]` 仅构建；远程 D1 migration 由 `deploy-all.mjs` 统一处理 | ✅ |
| Node 全链路 26.10.0 | ✅ |
| CI：路由 / SEO / 白标 / migrations / test / dry-run | ✅ |
| `/admin/setup` + 可选 `SETUP_TOKEN` | ✅ |
| JWT 可 CACHE_KV 自动生成 | ✅ |
| 前台仅中文 | ✅ |

---

## 1. 一键部署（推荐，无需本地）

打开 [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/szfp8/claude)。

在 **「设置您的应用程序」** 中按 `docs/CF-ONE-CLICK.md` 填写：

- KV / D1 / R2 均选 **new**
- **关闭**「启用读取复制」
- **所有 Secret 可全部留空**（`JWT_SECRET` 由系统自动生成；`SETUP_TOKEN` 留空则无初始化门禁）
- 预览构建 / Cloudflare Access 建议关闭

部署后：

1. `/healthz?probe=1` → `ok` 且 `d1_schema`
2. `/admin/setup` 创建管理员（请尽快完成）
3. `/admin/settings` 填站点信息

首次 schema 未齐：先查看 `postdeploy:check` / `/healthz?probe=1`，不要把重试当作正常迁移步骤。

---

## 2. 零配置 Builds

| 字段 | 建议 |
|------|------|
| Production branch | `main` |
| Root directory | 留空 |
| Build command | 留空（由 `wrangler.toml` `[build]` 执行） |
| Deploy command | `npm run deploy` |
| Node.js | **26.10.0**（`.nvmrc`） |

---

## 3. 资源绑定

| Binding | 用途 |
|---------|------|
| `DB` | D1 |
| `CACHE_KV` | 限流 / **JWT 自动密钥** |
| `R2_MEDIA` | 媒体 |
| `AI` | Workers AI |
| `ASSETS` | `public/` |

---

## 4. Secrets（均可留空）

| Secret | 留空时行为 |
|--------|------------|
| JWT_SECRET | **自动**：CACHE_KV 生成 256-bit 密钥 |
| SETUP_TOKEN | 无门禁；请尽快 `/admin/setup` |
| 其余 | 对应功能关闭，需要时再在 Dashboard 补填 |

排障：`docs/CF-SETUP-TROUBLESHOOTING.md`。
