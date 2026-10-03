# 后台模块说明：导航 / 语言 / 联系方式

## 1. 导航标签与顺序

前台 6 个入口路径固定，**标签名**可在后台修改：

| 页面 | 路径 | 后台位置 |
|------|------|----------|
| 首页 | `/` | `/admin/pages` → 首页 → 中文/英文标签 |
| 服务项目 | `/service` | `/admin/pages` → 服务项目 |
| 服务城市 | `/city` | `/admin/pages` → 服务城市 |
| 新闻资讯 | `/article` | `/admin/pages` → 新闻资讯 |
| 关于我们 | `/about` | `/admin/pages` → 关于我们 |
| 联系我们 | `/contact` | `/admin/pages` → 联系我们 |

**桌面顺序 / 移动顺序 / 启停** 通过导航模块 API 或设置键 `navigation_json` 控制：

- `GET /admin/modules/navigation`
- `POST /admin/modules/navigation`  body: `{ items: [{ key, label, path, enabled, sortOrder, mobileOrder }] }`

路径不可随意改（与路由绑定）；可改 label、enabled、sortOrder、mobileOrder。

前台 layout 通过 `buildLayoutChrome(settings, locale)` 注入 `navItems` + `navLabels` + `languages`。

## 2. 语言开关（含 English）

前台 `/lang/zh-CN?back=%2Fservice` 与 `/lang/en?back=...` 仍可用。

**是否显示 English 切换** 由语言模块决定（默认 English 关闭）：

- `GET /admin/modules/languages`
- `POST /admin/modules/languages`  body:

```json
{
  "items": [
    { "code": "zh-CN", "name": "中文", "enabled": true, "default": true },
    { "code": "en", "name": "English", "enabled": true }
  ]
}
```

设置键：`languages`。只启用中文时，页头不显示语言切换。

## 3. 联系方式（通用渠道模块）

兼容旧字段 `contact_phone` / `contact_wechat` / `contact_qqs`，推荐使用通用渠道：

- `GET /admin/modules/contact`
- `POST /admin/modules/contact`  body:

```json
{
  "items": [
    { "id": "1", "type": "phone", "label": "电话", "value": "13800000000", "enabled": true, "sortOrder": 1 },
    { "id": "2", "type": "wechat", "label": "微信", "value": "wxid_xxx", "enabled": true, "sortOrder": 2 },
    { "id": "3", "type": "email", "label": "邮箱", "value": "hi@example.com", "enabled": true, "sortOrder": 3 }
  ]
}
```

支持类型：`phone` | `wechat` | `qq` | `email` | `whatsapp` | `telegram` | `address` | `custom`。

二维码仍在 **系统设置** `/admin/settings` 的 `contact_qr_url`（R2 `/media/...`）。

也可在 `/admin/settings` 继续使用旧的电话/微信/QQ 文本框；有 `contact_channels` 时优先用渠道模块。

## 4. AI 发布与配图

- AI 采集/写作只进入 `pending_review`，**不会自动公开**。
- 人工审核通过后：Sitemap → 百度普通收录通知 → IndexNow → 国内平台发布包。
- 文章封面图：后台文章编辑可上传 R2 图片；AI 预览「采用并提交审核」后，在审核页可补封面图再发布。

## 5. 白标复刻

1. 连接当前 GitHub 仓库到 Cloudflare Workers Builds（不要创建第二个 Fork/仓库）
2. `/admin/setup` 创建管理员
3. `/admin/settings` 填行业、主题词、联系方式
4. `/admin/pages` 改六大页标签与标题
5. 按需开启 English：`POST /admin/modules/languages`
