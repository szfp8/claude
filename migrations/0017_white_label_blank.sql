-- 白标新站初始化清理。
-- 0016_email_replies 已由既有版本使用，本文件使用 0017 避免覆盖现有 migration 历史。
-- 仅在尚未创建管理员的新站执行，避免自动清空已经投入使用的生产 D1。

DELETE FROM message_replies WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM social_posts WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM review_logs WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM collection_logs WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM submit_logs WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM subproject_items WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM subprojects WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM keywords WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM articles WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM news_sources WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM services WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM cities WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM media_assets WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM messages WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM daily_stats WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
DELETE FROM settings WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);

INSERT INTO settings (key, value)
SELECT 'seed_state', 'blank-white-label'
WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);

INSERT INTO settings (key, value)
SELECT 'news_collection_enabled', '0'
WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);

INSERT INTO settings (key, value)
SELECT 'page_settings_json', ''
WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
