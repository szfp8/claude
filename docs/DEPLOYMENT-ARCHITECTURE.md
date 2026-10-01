# 部署架构与首次部署说明

本文记录当前 `main` 分支实际部署代码的工作方式，避免后续复制白标 CMS 到新的 GitHub/Cloudflare 项目时误用旧的 `npx wrangler deploy` 流程。

## 1. 当前部署入口

仓库的唯一推荐部署入口是：

```bash
npm run deploy
```

`package.json` 将其指向：

```text
node scripts/deploy-all.mjs
```

`predeploy` 会先确认 Wrangler、`wrangler.toml`、部署脚本和部署命令存在且匹配。

## 2. 首次部署完整流程

```text
Cloudflare Workers Builds
        |
        | Deploy command = npm run deploy
        v
scripts/deploy-all.mjs
        |
        +--> 检查远程 D1 migrations
        |
        | D1 尚未就绪
        v
第一次 wrangler deploy
        |
        +--> 创建/准备当前 Worker 所需资源
        |
        v
wrangler d1 migrations apply DB --remote --yes
        |
        v
第二次 wrangler deploy
        |
        v
npm run postdeploy:check
        |
        v
部署完成
```

如果远程 D1 已经存在，流程会跳过第一次资源准备部署，直接执行远程 migrations，然后重新部署 Worker。

因此，**D1 migration 不在 Worker 打包阶段执行，而是在部署脚本中显式执行**。

## 3. 为什么不能使用默认 Deploy command

Cloudflare Workers Builds 如果使用：

```text
npx wrangler deploy
```

会直接发布 Worker，但不会自动调用仓库的：

```text
scripts/deploy-all.mjs
```

这样首次部署可能出现：

```text
Worker 已发布
    |
    +--> D1 binding 存在
    |
    +--> D1 schema 尚未迁移
    |
    +--> /healthz?probe=1
             d1_schema = false
             missing_tables = [...]
```

这也是首次部署后进入 `/admin/setup` 时可能表现为初始化异常的主要原因之一。

因此 Workers Builds 的 **Deploy command 必须设置为**：

```text
npm run deploy
```

仓库代码可以检查并提示这一要求，但 GitHub 仓库本身不能替 Cloudflare Dashboard 修改该字段。

## 4. Cloudflare 资源绑定

`wrangler.toml` 保持白标模板，不绑定某一个具体客户的资源名称。

当前核心绑定：

| Binding | 用途 |
| --- | --- |
| `DB` | Cloudflare D1 数据库 |
| `CACHE_KV` | 缓存、初始化状态和自动生成的会话密钥 |
| `R2_MEDIA` | 媒体文件 |
| `AI` | Workers AI |
| `ASSETS` | `public/` 静态资源 |

D1 使用：

```text
migrations_dir = "migrations"
```

并且模板不固定具体 `database_name`、`bucket_name`，避免复制仓库后继续指向原项目资源。

## 5. JWT_SECRET 首次部署行为

当前 `src/utils/auth.ts` 支持不填写 `JWT_SECRET`。

处理顺序：

```text
JWT_SECRET 已配置
    |
    +--> 直接使用

JWT_SECRET 未配置
    |
    v
CACHE_KV
    |
    +--> 已有 __cms_jwt_secret
    |       |
    |       +--> 使用已有密钥
    |
    +--> 没有密钥
            |
            v
        生成 32 字节随机密钥
            |
            v
        保存到 CACHE_KV
            |
            v
        后续请求复用
```

因此，标准白标部署不要求用户手工生成 JWT_SECRET。

如果生产环境希望把会话密钥从 KV 中独立出来，也可以在 Cloudflare Dashboard 中后续配置 `JWT_SECRET`。

## 6. 推荐 Cloudflare Dashboard 配置

新项目连接本仓库时：

```text
Production branch: main
Root directory: /
Build command: npm run build
Deploy command: npm run deploy
Node.js: 26.10.0
```

其中最关键的是：

```text
Deploy command = npm run deploy
```

Node 版本由：

```text
.nvmrc = 26.10.0
package.json engines.node = 26.10.0
```

共同约束，GitHub Actions 也读取 `.nvmrc`。

## 7. 部署后的健康检查

部署脚本最后执行：

```bash
npm run postdeploy:check
```

部署完成后建议访问：

```text
/healthz?probe=1
```

正常状态应满足：

```json
{
  "ok": true,
  "bindings": {
    "DB": true,
    "CACHE_KV": true,
    "R2_MEDIA": true,
    "AI": true,
    "ASSETS": true
  },
  "d1_schema": true,
  "missing_tables": []
}
```

如果出现：

```text
d1_schema: false
missing_tables: [...]
```

优先检查 Cloudflare Workers Builds 的 Deploy command，而不是重复创建 D1 binding。

## 8. GitHub Actions 校验

`.github/workflows/deploy.yml` 当前负责验证：

- Node 版本与 `.nvmrc` 一致
- 所有 `.mjs` 脚本语法
- 后台路由
- 前台路由和链接完整性
- SEO/GEO 发布契约
- 白标内容
- 管理后台禁止 GET mutation
- Cloudflare 部署配置
- D1 migration 命名
- Contact Channels 字段
- TypeScript build
- 单元测试
- 本地 D1 migration dry run
- Wrangler dry run

该 Workflow 是代码质量与部署配置的 CI 校验，**不是 Cloudflare Dashboard 的 Deploy command 设置器**。

## 9. 复制到新 GitHub 仓库时

复制本模板后，只需要让新项目：

1. 使用 `main`。
2. Cloudflare Workers Builds 指向新仓库。
3. Root directory 保持 `/`。
4. Deploy command 设置为 `npm run deploy`。
5. Node 使用 26.10.0。
6. 按实际站点需要配置 `SITE_NAME`、`SITE_URL`、`DEFAULT_CITY` 等运行时变量。
7. 首次部署完成后检查 `/healthz?probe=1`。
8. 确认 `d1_schema=true` 后再进行管理员初始化。

## 10. 当前代码结论

当前部署代码已经把“资源准备 → D1 migration → Worker 再部署 → 部署后检查”串成一个明确的脚本闭环。

需要特别保留的设计原则：

- 不把客户资源名称写死在模板。
- 不把远程 D1 migration 放进 Wrangler build 阶段。
- 不依赖人工填写 JWT_SECRET 才能完成标准首次部署。
- 不用默认 `npx wrangler deploy` 替代 `npm run deploy`。
- 不通过 README 掩盖部署问题，实际部署行为以 `package.json`、`scripts/deploy-all.mjs`、`wrangler.toml` 和 CI 检查为准。
