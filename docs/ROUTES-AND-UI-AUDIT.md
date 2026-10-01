# Routes and UI Audit

## Public routes

| Path | Purpose |
|---|---|
| `/` | Home |
| `/service` | Service list |
| `/service/:slug` | Service detail |
| `/service/topic/:slug` | Service topic |
| `/city` | City list |
| `/city/:slug` | City detail |
| `/city/:citySlug/:serviceSlug` | City × service landing page |
| `/city/topic/:slug` | City topic |
| `/article` | News / insights list |
| `/new` | Topic-oriented news list |
| `/article/:slugOrId` | Article detail |
| `/article/tag/:slug` | Article topic |
| `/about` | About |
| `/contact` | Contact form GET |
| `/contact` | Contact form POST |
| `/search` | Site search |
| `/lang/:code` | Language switch (relative back only) |

## Navigation

Six stable paths:

```text
首页 / · 服务项目 /service · 服务城市 /city · 新闻资讯 /article · 关于我们 /about · 联系我们 /contact
```

- Labels: `/admin/pages` (zh/en) and/or `/admin/modules` navigation table
- Desktop order: `sortOrder`
- Mobile drawer + bottom bar: `mobileOrder`
- English switcher only when English is enabled under `/admin/modules` languages

## Admin modules

| Path | Purpose |
|---|---|
| `/admin/modules` | Visual UI: contact channels, nav order, languages |
| `/admin/modules/contact` | JSON API |
| `/admin/modules/navigation` | JSON API |
| `/admin/modules/languages` | JSON API |

All require admin session (`requireAdmin`).

## Images and media

- R2 media library: `/admin/media`
- Article cover: `cover_image` field on article form / AI preview (path `/media/...` or https)
- Contact QR: `/admin/settings` + `/wechat-qr`
- Home / city / service page images via page image settings

## SEO / machine-readable endpoints

```text
/robots.txt
/sitemap.xml
/llms.txt
/ai-index.json
```

## Verification

CI validates routes, white-label residue, SEO/GEO contract, TypeScript, tests, D1 migrations, Wrangler dry-run.
See also `docs/AUDIT-STATUS.md` and `docs/SEO-GEO-CLOSURE.md`.
