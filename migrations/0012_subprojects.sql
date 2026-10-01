CREATE TABLE IF NOT EXISTS subprojects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  label_zh TEXT NOT NULL,
  label_en TEXT NOT NULL DEFAULT '',
  title_zh TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  subtitle_zh TEXT NOT NULL DEFAULT '',
  subtitle_en TEXT NOT NULL DEFAULT '',
  content_zh TEXT NOT NULL DEFAULT '',
  content_en TEXT NOT NULL DEFAULT '',
  seo_title_zh TEXT NOT NULL DEFAULT '',
  seo_title_en TEXT NOT NULL DEFAULT '',
  seo_description_zh TEXT NOT NULL DEFAULT '',
  seo_description_en TEXT NOT NULL DEFAULT '',
  seo_keywords_zh TEXT NOT NULL DEFAULT '',
  seo_keywords_en TEXT NOT NULL DEFAULT '',
  layout TEXT NOT NULL DEFAULT 'grid',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(section, slug),
  CHECK(section IN ('service','article','new','city')),
  CHECK(layout IN ('grid','list','feature'))
);

CREATE INDEX IF NOT EXISTS idx_subprojects_section_active_sort
  ON subprojects(section, is_active, sort_order, id);

CREATE TABLE IF NOT EXISTS subproject_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subproject_id INTEGER NOT NULL REFERENCES subprojects(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(subproject_id, item_type, item_id),
  CHECK(item_type IN ('service','article','city'))
);

CREATE INDEX IF NOT EXISTS idx_subproject_items_project
  ON subproject_items(subproject_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_subproject_items_target
  ON subproject_items(item_type, item_id, subproject_id);
