-- 白标站点画像结构迁移：不预置任何行业内容。
-- 实际行业、服务、主题词和新闻分类由后台设置或显式 starter 模板写入。
INSERT OR IGNORE INTO settings (key, value) VALUES
('site_topic', ''),
('site_industry', ''),
('primary_services', ''),
('primary_keywords', ''),
('news_categories', '');
