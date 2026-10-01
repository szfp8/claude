# Cloudflare 一键部署填写说明

面向仪表盘 **「设置您的应用程序」** 向导（Deploy to Cloudflare / Workers 连接 Git）。

**最简路径：所有 Secret 全部留空也能部署成功并完成 `/admin/setup`。**

---

## Secret 能不能自动生成？

| Secret | 能否自动 | 一键部署怎么做 |
|--------|----------|----------------|
| **JWT_SECRET** | **能** | **留空即可**。首次登录/setup 时，Worker 在 `CACHE_KV` 写入 256-bit 随机密钥并沿用。无需手填长串。 |
| **SETUP_TOKEN** | 不自动生成 | **留空即可**（无门禁）。部署后请**马上**打开 `/admin/setup` 建管理员；建好后外人无法再 setup。若担心被抢先，可手填一串随机字符，setup 表单会要求同一令牌。 |
| **其它 Secret** | — | **全部留空**。需要对应功能时，再在 Dashboard → Variables and Secrets 补填。 |

其它 Secret 含义：

| Secret | 留空时 | 什么时候再填 |
|--------|--------|--------------|
| PBKDF2_ITERATIONS | 默认 5000 | 付费计划想提高强度时 |
| INDEXNOW_KEY | 不推 IndexNow | 开通 IndexNow 后 |
| EXTERNAL_AI_API_KEY | 只用 Workers AI | 接第三方 OpenAI 兼容接口时 |
| RESEND_API_KEY | 无邮件回复 | 要用 Resend 回留言时 |
| GOOGLE_SERVICE_ACCOUNT_JSON | 不用 | 仅特殊 Google 能力 |

---

## 推荐填写（资源）

| 字段 | 建议 | 说明 |
|------|------|------|
| Git 帐户 | 已授权的 GitHub | `main` 推送自动部署 |
| 创建专用 Git 存储库 | 一般不要 | 已有 `szfp8/claude` 直接连该仓库 |
| Select KV 命名空间 | **new** | 绑定名 `CACHE_KV`（限流 + **JWT 自动密钥**） |
| Select D1 数据库 | **new** | 绑定名 `DB` |
| 启用读取复制 | **关闭** | Free 不需要 |
| Select R2 存储桶 | **new** | 绑定名 `R2_MEDIA` |
| JWT_SECRET | **留空** | 自动生成 |
| SETUP_TOKEN | **留空**（或自拟） | 留空=无门禁，请尽快 setup |
| 其余 Secret | **全部留空** | 见上表 |
| 启用预览构建 | 可关 | |
| Protect with Cloudflare Access | 可关 | 勿挡公开前台 |
| 高级设置 | 不动 | Node = **26.10.0**（`.nvmrc`） |

---

## 绑定与仓库对齐

`wrangler.toml`：`DB`、`CACHE_KV`、`R2_MEDIA`、`AI`、`ASSETS`。向导选 **new** 即自动创建并注入。

---

## 部署后三步

```text
1. /healthz?probe=1  → ok + d1_schema
2. /admin/setup      → 创建管理员（若填了 SETUP_TOKEN 则输入同一令牌）
3. /admin/settings   → 站点名称、联系方式等
```

首次 `d1_schema` 为 false：Builds **Retry deployment** 一次。

---

## 部署按钮

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/szfp8/claude)

详见 `docs/DEPLOYMENT.md`。
