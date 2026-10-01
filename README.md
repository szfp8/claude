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

部署时由 Cloudflare 自动执行构建和发布。

---

## D1 数据库配置

数据库绑定保持固定：

```toml
binding = "DB"
```

不要提交固定数据库 ID：

```toml
database_id = "xxx"
```

原因：

- 不同 Cloudflare 账号资源 ID 不同
- Fork 后必须创建新数据库
- 防止连接旧生产环境

数据库迁移由部署流程自动执行。

---

## 常用命令

### 环境诊断

```bash
npm run doctor
```

检查：

- Node.js 版本
- Wrangler 状态
- 部署配置
- 环境变量

### 仓库验证

```bash
npm run verify
```

检查：

- 必需目录
- 必需脚本
- Cloudflare 配置
- D1 binding
- migration 文件

### 类型检查

```bash
npm run typecheck
```

### 完整验证

```bash
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

## 部署问题排查

### 1. D1 migration 失败

执行：

```bash
npm run doctor
npm run verify
```

确认：

- DB binding 存在
- migrations 目录存在
- 没有硬编码 database_id

---

### 2. Worker 名称异常

Cloudflare Workers Builds 可能覆盖 Worker 名称。

部署脚本优先读取：

```text
WRANGLER_CI_OVERRIDE_NAME
CLOUDFLARE_WORKER_NAME
WORKER_NAME
```

避免白标项目名称覆盖实际部署目标。

---

## 发布检查清单

提交代码前必须通过：

```bash
npm run doctor
npm run verify
npm run typecheck
npm run validate:complete
```

发布标准：

- ✅ 新 Cloudflare 账号可以部署
- ✅ 不依赖旧资源
- ✅ 敏感配置不进入 Git
- ✅ 部署错误可以定位
- ✅ 文档与代码保持同步

---

## 版本说明

当前文档版本：v1

本 README 用于说明项目架构、复制部署流程、环境配置和故障排查方法。
