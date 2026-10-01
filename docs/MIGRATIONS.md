# D1 Migrations 说明

## 命名规则

- 文件名：`NNNN_description.sql`（四位编号 + 小写字母/数字/下划线）
- **不要重命名**已经在生产库执行过的 migration 文件；D1 按文件名记录已执行历史
- 新增 migration 只能使用更大的下一个编号
- 历史遗留：`0003_enhance.sql` 与 `0003_media_assets.sql` 编号重复，已在生产执行，**不得改名**；CI 的 `check:migrations` 已登记该例外

## 白标空站

- `0002_seed.sql`：空操作，不写入行业/城市/服务/文章
- `0015_site_profile.sql`：只插入空字符串画像键
- `0017_white_label_blank.sql`：仅在**尚无管理员**时清理业务表；已有管理员的生产库不会被清空
- `0018_industry_keywords.sql`：空词池

## CI

```bash
npm run check:migrations
```

在 `Validate Cloudflare Worker` workflow 中自动运行。
