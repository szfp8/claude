-- 多平台分发内容表：抖音/快手/小红书/哔哩哔哩共用一张表，按 (article_id, platform) 唯一。
-- 跟微信排版（articles.wechat_*）分开存，是因为微信当时只做了一个平台，直接加列更省事；
-- 这次一次加四个平台，用独立表 + platform 字段更好扩展，以后再加平台不用改表结构。
-- 同样【不接任何平台的开放API】——只生成内容 + 一键复制，发布仍需人工登录对应平台后台完成。
CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,           -- douyin / kuaishou / xiaohongshu / bilibili
  title TEXT,
  content TEXT,                     -- 短视频口播脚本 / 小红书笔记正文 / B站专栏正文
  hashtags TEXT,                    -- 逗号分隔，不含 # 号，展示时再拼
  cover_url TEXT,
  ai_generated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_synced',  -- not_synced / ready / copied / scheduled
  scheduled_at TEXT,                -- 仅自己提醒用，不会触发任何自动发布
  synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(article_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_article ON social_posts(article_id);
