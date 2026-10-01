# 安全合入说明（当前 main）

版本：`0.4.4+`（与仓库 `package.json` 对齐）。

## 已在 main 生效

| 项 | 位置 |
|---|---|
| 忽略本地密钥 / `SETUP_TOKEN` 示例 | `.gitignore`、`.dev.vars.example` |
| Secret 类型 | `src/types.ts`（`SETUP_TOKEN`、`PBKDF2_ITERATIONS`、`multilingual`） |
| 密码强度、可配置 PBKDF2、DUMMY 哈希 | `src/utils/password.ts` |
| JWT 签名 **timing-safe** 比较 | `src/utils/auth.ts` |
| 登录锁定、多语言禁用边缘公开缓存 | `src/middleware/security.ts` |
| 按启用语言解析 | `localeResolve` / `i18n` / `languageManager` |
| `/admin/setup` 令牌、登录锁定、密码强度 | `src/routes/admin.ts` |
| setup 令牌表单字段 | `src/templates/admin.ts` |
| **POST/GET `/admin/logout`**（应用级） | `src/index.ts` |
| create-admin 与 Worker 一致的 PBKDF2 | `scripts/create-admin.mjs` |
| migration 命名 CI | `scripts/check-migrations.mjs` |
| 单元测试 | `tests/password.test.ts`、`tests/security.test.ts`、`tests/locale.test.ts`、`tests/auth.test.ts` |

## 生产建议 Secret

```text
JWT_SECRET      强烈建议
SETUP_TOKEN     首次初始化前建议开启，创建管理员后可删
PBKDF2_ITERATIONS  可选（Free 默认 5000）
```

部署后路径：`/healthz?probe=1` → `/admin/setup` → `/admin/settings`。

排障见 `docs/CF-SETUP-TROUBLESHOOTING.md`。
