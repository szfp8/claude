# Cloudflare Workers 白标 CMS

可复刻、可 Fork、可独立部署的 Cloudflare Workers CMS 基础模板。

设计目标：新的 Cloudflare 账号、Worker、D1、KV、R2 环境，都可以直接从 GitHub 仓库完成一次性部署，不依赖 ZIP 文件，也不需要人工创建 Cloudflare 资源。

## 新环境一键部署

标准流程：

```text
GitHub Repository
      ↓
Cloudflare Workers Builds
      ↓
npm ci
      ↓
npm run deploy
      ↓
scripts/deploy-all.mjs
      ↓
检查 Cloudflare 资源
      ↓
自动创建 KV / D1 / R2
      ↓
执行 D1 migrations
      ↓
部署 Worker
      ↓
执行健康检查
```

不需要：

- 下载 ZIP
- 本地安装 Wrangler
- 手动创建 D1
- 手动复制 database_id
- 手动执行 migration

## Fork / 复制部署规范

复制仓库到新的 GitHub 账号后：

1. 创建 Cloudflare Workers Build 项目
2. 连接新的 GitHub Repository
3. 设置部署命令：

```bash
npm run deploy
```

4. Cloudflare 会自动完成资源初始化。

仓库不保存：

- API Key
- Token
- 生产密码
- 客户信息
- 业务私有配置

所有环境变量和 Secret 应通过 Cloudflare Dashboard 或 CI Secret 配置。

## Cloudflare Workers Builds 配置

```text
Production branch = main
Root directory    = /
Build command     = 留空
Deploy command    = npm run deploy
Node.js           = 26.10.0
```

## 自动创建资源

首次部署自动创建：

- D1 Database
- KV Namespace
- R2 Bucket
- Workers AI Binding
- Static Assets

资源绑定统一由 `wrangler.toml` 管理。

## 部署完整性检查

部署脚本会检查：

- Wrangler 是否安装
- Cloudflare 资源是否存在
- D1 是否可访问
- migrations 是否执行
- Worker 是否成功发布
- 部署后健康状态

部署完成后访问：

```text
/healthz?probe=1
```

正常结果：

```json
{
  "d1_schema": true,
  "missing_tables": []
}
```

## 本地开发

```bash
npm ci
npm run build
npm run db:migrate:local
npm run dev
```

## 项目结构

```text
src/              Worker 源码
migrations/       D1 数据库迁移
scripts/          自动部署和检查脚本
public/           静态资源
wrangler.toml     Cloudflare 资源配置
```

## 核心能力

- Hono + TypeScript + Cloudflare Workers
- D1 数据库
- KV 缓存
- R2 媒体存储
- Workers AI
- 中文白标前台
- 页面管理
- SEO 路由
- Sitemap / robots / llms.txt

## 维护原则

保持仓库可复制：

- 新环境无需修改代码
- 不依赖旧 Cloudflare 资源
- 不提交环境密钥
- 部署失败必须输出明确原因
- 文档与部署流程同步更新
