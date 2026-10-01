-- 微信公众号排版所需字段。注意：本版本不接入微信公众号API，
-- wechat_status 只在"一键复制/保存"和"记录预约发布时间"时更新，不会真的自动上传草稿箱或定时发布。
ALTER TABLE articles ADD COLUMN wechat_title TEXT;
ALTER TABLE articles ADD COLUMN wechat_summary TEXT;
ALTER TABLE articles ADD COLUMN wechat_cover_url TEXT;
ALTER TABLE articles ADD COLUMN wechat_content TEXT;
ALTER TABLE articles ADD COLUMN wechat_status TEXT DEFAULT 'not_synced'; -- not_synced/ready/copied/scheduled
ALTER TABLE articles ADD COLUMN wechat_scheduled_at TEXT;
ALTER TABLE articles ADD COLUMN wechat_synced_at TEXT;
