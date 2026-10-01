-- AI 采集改写流程需要的字段：AI 自评质量分 + 图解卡片要点原始数据（便于以后重新渲染/接入视频）
ALTER TABLE articles ADD COLUMN ai_score INTEGER DEFAULT 0;
ALTER TABLE articles ADD COLUMN slides_json TEXT;
