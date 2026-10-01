# SEO / GEO 发布闭环

## AI 内容
AI 不直接决定公开内容。

```text
事实来源
→ 来源抓取/分析
→ AI 整理与独立表达
→ 质量门槛
→ pending_review
→ 人工审核
→ published
→ Sitemap
→ 百度普通收录通知
→ IndexNow
→ 内容/视频平台发布包
```

新闻内容保留来源名称和原文 URL；AI 不得编造数字、文件编号、案例、联系方式或来源未支持的结论。

## Sitemap
`/sitemap.xml` 只输出公开且可索引的服务、城市、文章和有效城市×服务页面。

外部服务跳转不进入 Sitemap；低机会分城市×服务组合不进入 Sitemap；只有 published 文章进入 Sitemap。

## 百度
百度普通收录支持 API、Sitemap 与手动提交；模板在配置 `baidu_token` 时对人工审核后已发布 URL 执行主动提交。主动提交是发现信号，不等于已经索引。

## 百度 AI 搜索
模板不把“百度普通收录”当成“百度 AI 搜索自动引用”。代码侧提供公开可抓取页面、结构化数据、`/llms.txt`、`/ai-index.json` 与稳定 canonical URL，并在后台渠道矩阵中标记为“监测/自然抓取”，不虚构不存在的 AI 专用推送接口。

## Bing / IndexNow
当前模板统一用 IndexNow 通知公开 URL 的新增、更新、删除。Bing 官方当前推荐 IndexNow；模板不再依赖旧 Bing SOAP/POX URL Submission API。

## Google
普通文章/城市/服务页面：稳定 URL + 内部链接 + Sitemap + Search Console。
Google Indexing API 不是普通文章批量提交接口，仅用于官方限定页面类型。

## 360 / 搜狗
以 Sitemap、robots、官方站长平台和自然抓取为基础，不绑定未经验证的旧 API。后台日志将这类通道显示为“跳过 / 手动”，不会伪装成已经自动提交成功。

## GEO / AI 搜索
提供：
```text
/robots.txt
/sitemap.xml
/llms.txt
/ai-index.json
```

页面提供 canonical、JSON-LD、清晰标题/摘要、H2/H3、来源链接与稳定 URL。

这些是机器理解和发现信号，不保证任何 AI 搜索平台抓取、收录或引用。

## SEO 关键词
后台 `industry_keywords` 是站点级行业词池，会自动进入 SEO 候选和全部 AI 提示词上下文；最终页面 `seo_keywords` 仍固定 3–5 个主题词。

一页一主搜索意图；标题、摘要、正文和主题词必须语义一致；不复制全站词库；不做城市+服务机械堆叠。

## 新闻发布
新闻采集经过来源抓取、详情正文获取、AI独立整理、重复度检查、结构/事实边界/关键词/质量分门槛后，只进入 `pending_review`。管理员人工审核并明确发布后，才进入 `published`，随后触发 Sitemap、百度普通收录通知、IndexNow 和国内内容/视频发布包。

## 内容平台
人工审核通过后生成抖音、快手、小红书、哔哩哔哩发布包。

`ready` 代表 CMS 已准备好对应平台发布包，不代表通过第三方平台 API 实际外发；账号登录、授权和最终外发仍按各平台官方流程人工完成。

## 删除
公开页面删除后：
```text
Sitemap 移除
→ IndexNow 删除通知
→ D1 / social / R2 关联清理
→ 缓存失效
```

以上机制改善可抓取、可发现、可理解和可追溯性，不承诺必然收录、排名或 AI 引用。