-- 让后台“今日新增文章”按时间范围查询时可以命中索引，减少全表扫描。
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at DESC);
