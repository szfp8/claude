# Cloudflare Workers 白标 CMS

一个可复刻、可 Fork、可独立部署的 Cloudflare Workers CMS 模板。

项目目标：将仓库复制到新的 Cloudflare 账号后，不依赖原账号资源、不依赖 ZIP 包，通过标准化流程完成完整部署。

## 项目简介

本项目采用 Cloudflare 全托管架构：

- Cloudflare Workers：运行后端服务
- D1：关系型数据库
- KV：键值存储
- R2：对象存储
- Assets：静态资源
- Workers AI：AI 能力扩展

设计原则：

1. **环境隔离**：不同 Cloudflare 账号拥有独立资源。
2. **白标部署**：Fork 后可以作为新的独立项目运行。
3. **自动检查**：部署前发现配置问题，减少人工排查。
4. **配置安全**：仓库不保存敏感信息。

---

## v1.0.0 Deployment Checklist

Before deploy:

```text
[x] GitHub repository connected
[x] Cloudflare Workers Build enabled
[x] Node.js 26.10
[x] npm ci success
[x] npm run doctor success
[x] npm run verify success
```

Deploy:

```text
[x] npm run deploy
```

After deploy:

```text
[x] Worker URL available
[x] /healthz?probe=1
[x] D1 schema ready
[x] Admin setup available
```

---

## v1.0.0 发布流程

```text
GitHub Fork
      |
      v
Connect Cloudflare
      |
      v
Workers Build
      |
      v
npm run doctor
      |
      v
npm run verify
      |
      v
npm run deploy
      |
      v
D1/KV/R2 自动创建
      |
      v
Migration
      |
      v
Worker Online
```

---

## 快速部署流程

完整部署链路：

```text
GitHub Repository
        ↓
Cloudflare Workers Builds
        ↓
npm ci
        ↓
npm run doctor
        ↓
npm run verify
        ↓
npm run deploy
        ↓
检查 Cloudflare 资源
        ↓
执行 D1 migrations
        ↓
发布 Worker
        ↓
健康检查
```

---

## Cloudflare 复制部署说明

每个 Cloudflare 账号都是独立运行环境。

仓库禁止提交以下内容：

- Cloudflare Token
- API Key
- database_id
- 生产环境 Secret
- 用户数据

Fork 项目后，需要在新的 Cloudflare 环境创建：

- Worker
- D1 数据库
- KV Namespace
- R2 Bucket
- Assets
- Workers AI 配置

这样可以避免新项目错误连接旧环境。

---

## 环境要求

推荐环境：

```text
Node.js >= 26
npm >= 10
Cloudflare Wrangler 最新版本
```

安装依赖：

```bash
npm ci
```

登录 Cloudflare：

```bash
npx wrangler login
```

---

## 本地部署

执行：

```bash
npm ci
npm run doctor
npm run verify
npm run deploy
```

部署完成后，Worker 会自动连接当前 Cloudflare 账号资源。

---

## Cloudflare Workers Builds 配置

推荐配置：

```text
Production branch = main
Root directory = /
Build command = 留空
Deploy command = npm run deploy
Node.js = 26.10.0
```

---

## D1 数据库配置

数据库绑定保持固定：

```toml
binding = "DB"
```

不要提交固定数据库 ID。

---

## 常用命令

```bash
npm run doctor
npm run verify
npm run deploy
npm run typecheck
npm run validate:complete
```

---

## 项目目录结构

```text
src/                Worker 源码
migrations/         D1 数据库迁移文件
scripts/            部署与检查脚本
public/             静态资源
.github/            CI 工作流
wrangler.toml       Cloudflare 配置
```

---

## 发布标准

```bash
npm run doctor
npm run verify
npm run typecheck
npm run validate:complete
```

要求：

- 新环境可复制
- 不绑定旧资源
- 部署错误可诊断
- 文档与代码同步

当前版本：v1.0.0
