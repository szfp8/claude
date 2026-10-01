-- 高频查询索引：减少 D1 全表扫描、读行数和 Worker CPU。
CREATE INDEX IF NOT EXISTS idx_articles_status_published_at ON articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_source_url ON articles(source_url);
CREATE INDEX IF NOT EXISTS idx_cities_active_sort ON cities(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_services_active_sort ON services(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_news_sources_active_last ON news_sources(is_active, last_fetched_at, id);
CREATE INDEX IF NOT EXISTS idx_messages_status_created ON messages(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keywords_opportunity ON keywords(opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_submit_logs_created ON submit_logs(created_at DESC);
