-- 全国城市表(用于城市 SEO 矩阵)
CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,        -- 深圳
  slug TEXT NOT NULL UNIQUE,        -- shenzhen
  province TEXT,                    -- 广东省
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 服务类型（可按行业扩展）
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,        -- 示例服务
  slug TEXT NOT NULL UNIQUE,        -- service-slug
  icon TEXT,
  summary TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 关键词矩阵:城市 x 服务 自动组合,记录搜索量/难度/状态,供 SEO 页面自动生成
CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,            -- 深圳示例服务
  city_id INTEGER REFERENCES cities(id),
  service_id INTEGER REFERENCES services(id),
  search_volume INTEGER DEFAULT 0,
  difficulty TEXT DEFAULT '中',      -- 低/中/高
  opportunity_score INTEGER DEFAULT 0, -- 机会分 0-100
  status TEXT NOT NULL DEFAULT 'pending', -- pending/published/ranking
  landing_slug TEXT,                 -- 对应自动生成落地页 slug
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(city_id, service_id)
);

-- 文章 / 新闻(含 AI 采集改写内容)
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT,                     -- 政策解读/业务指南/常见问题/行业资讯
  city_id INTEGER REFERENCES cities(id),
  summary TEXT,
  content TEXT NOT NULL,             -- 最终发布内容(原创解读)
  source_url TEXT,                   -- 原始采集来源链接
  source_name TEXT,                  -- 来源站点名
  ai_generated INTEGER NOT NULL DEFAULT 0,  -- 是否 AI 采集改写
  credibility_score INTEGER DEFAULT 100,    -- 来源可信度
  status TEXT NOT NULL DEFAULT 'draft',     -- draft/pending_review/published
  cover_image TEXT,
  video_url TEXT,                    -- AI 生成的视频解读地址(可选)
  views INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_city ON articles(city_id);

-- 新闻采集源配置
CREATE TABLE IF NOT EXISTS news_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  feed_url TEXT NOT NULL,           -- RSS 或列表页地址
  credibility TEXT DEFAULT '中',     -- 高/中/低 可信来源标记
  is_active INTEGER NOT NULL DEFAULT 1,
  last_fetched_at TEXT
);

-- 客户留言
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT,
  city TEXT,
  service TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new/read
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 后台管理员账号
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 系统设置(站点信息、SEO 全局设置、第三方配置)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 搜索引擎推送日志(百度/Bing/Google/IndexNow)
CREATE TABLE IF NOT EXISTS submit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine TEXT NOT NULL,             -- baidu/bing/indexnow/google
  url TEXT NOT NULL,
  status_code INTEGER,
  response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
