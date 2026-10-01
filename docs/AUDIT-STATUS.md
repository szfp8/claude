# 需求完成度审计

更新时间：与 `main` 同步（v0.4.4+）。

## 维护记录（2026-09-29）

| 项 | 状态 |
|---|---|
| Node 26.10.0 全链路 | ✅ |
| 删除遗留 services 副本 | ✅ |
| JWT timing-safe | ✅ |
| 登出 GET+POST | ✅ |
| 前台语言 | ✅ **仅中文** |
| 一键部署向导说明 | ✅ `docs/CF-ONE-CLICK.md` |
| 导航 / 联系渠道 modules | ✅ |

## 部署

- GitHub 一键：见 `docs/CF-ONE-CLICK.md`
- 验收：`/healthz?probe=1` → `/admin/setup` → `/admin/settings`

## 用户速查

1. 联系方式：`/admin/modules` 或 `/admin/settings`
2. 导航：`/admin/modules`
3. AI 封面图：文章编辑 / AI 预览页
4. 语言：仅中文，无 English 开关
