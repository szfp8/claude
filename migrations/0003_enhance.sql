-- ===== 每页可单独设置 SEO 标题/描述/关键词 =====
ALTER TABLE articles ADD COLUMN seo_title TEXT;
ALTER TABLE articles ADD COLUMN seo_description TEXT;
ALTER TABLE articles ADD COLUMN seo_keywords TEXT;
ALTER TABLE articles ADD COLUMN card_svg TEXT;          -- AI 生成的图片解读卡片(内联SVG)

ALTER TABLE cities ADD COLUMN seo_title TEXT;
ALTER TABLE cities ADD COLUMN seo_description TEXT;
ALTER TABLE cities ADD COLUMN seo_keywords TEXT;
ALTER TABLE cities ADD COLUMN tier TEXT DEFAULT '二线';   -- 一线/新一线/二线/三线，影响关键词权重

ALTER TABLE services ADD COLUMN seo_title TEXT;
ALTER TABLE services ADD COLUMN seo_description TEXT;
ALTER TABLE services ADD COLUMN seo_keywords TEXT;
ALTER TABLE services ADD COLUMN demand_weight INTEGER DEFAULT 50; -- 该服务需求热度权重 0-100

-- ===== 审核流程 =====
ALTER TABLE articles ADD COLUMN reviewed_by TEXT;
ALTER TABLE articles ADD COLUMN reviewed_at TEXT;
ALTER TABLE articles ADD COLUMN reject_reason TEXT;

CREATE TABLE IF NOT EXISTS review_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  action TEXT NOT NULL,        -- approve/reject/edit
  operator TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== 采集任务运行日志（可观测：跑了没有、抓到几条、出错原因）=====
CREATE TABLE IF NOT EXISTS collection_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT,
  fetched_count INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  published_count INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== 城市权重：一线城市给予更高默认权重，影响机会分排序 =====
UPDATE cities SET tier = '一线' WHERE name IN ('北京','上海','广州','深圳');
UPDATE cities SET tier = '新一线' WHERE name IN ('杭州','成都','重庆','南京','苏州','武汉','西安','长沙','青岛','郑州','天津');

-- ===== 关键词表补充：记录评分明细，便于人工复核调整 =====
ALTER TABLE keywords ADD COLUMN city_weight INTEGER DEFAULT 50;
ALTER TABLE keywords ADD COLUMN service_weight INTEGER DEFAULT 50;
ALTER TABLE keywords ADD COLUMN note TEXT;
