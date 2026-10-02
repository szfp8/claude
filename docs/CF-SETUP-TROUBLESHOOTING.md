# Cloudflare 一键部署与 /admin/setup 排查

## 1. 推荐：按仓库固定配置 Workers Builds

请显式填写，避免 Cloudflare Dashboard 使用旧项目默认值：

| 字段 | 值 |
|------|---|
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Node.js | **26.10.0** |

`npm run deploy` 是当前唯一生产部署入口，会负责远程 D1 migration、Worker 发布和部署后健康检查。

如果旧项目仍然显示 `npx wrangler deploy` 或其他旧命令，请改成上面的仓库配置。不要再使用已经删除的 `try-remote-migrate.mjs`。

## 2. 首次部署后 d1_schema 为 false

首次 `wrangler deploy` 会预配 D1；migrations 可能在**下一次** deploy 的 `[build]` 中才成功。

处理：Dashboard **Retry deployment**，或再 push 一次 `main`，再查 `/healthz?probe=1`。

本地可用：`npm run deploy:all`。

## 3. healthz 正常但 /admin/setup 失败

绑定与表结构 OK 时，常见原因：

### A. Free 计划 CPU（Error 1102）

- 使用最新 `main`
- 密码 10–20 位
- 设置 Secret `JWT_SECRET` 后重试

### B. 已有管理员

`/admin/setup` 会跳到登录。忘记密码用 `npm run db:create-admin` 或清空 D1。

### C. Worker 名不一致

`wrangler.toml` 的 `name` 必须与 Dashboard Worker 名一致。

## 4. Runtime variables

可为空。生产建议 Secret：`JWT_SECRET`、`SETUP_TOKEN`。

## 5. 成功路径

```text
1. Deploy to Cloudflare 或连接 GitHub（保留默认 Builds）
2. 部署 success → /healthz?probe=1 → ok + d1_schema
3. （必要时 Retry 一次）
4. /admin/setup → /admin/settings
5. 可选 Disconnect GitHub
```
