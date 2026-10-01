-- 新闻文章关联服务，供服务页与城市×服务页展示相关资讯
ALTER TABLE articles ADD COLUMN service_id INTEGER REFERENCES services(id);
CREATE INDEX IF NOT EXISTS idx_articles_service ON articles(service_id);
