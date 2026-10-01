-- Contact Channels 字段迁移清理。
-- 旧的 contact_phone, contact_phones, contact_wechat, contact_wechats, contact_qqs 字段
-- 已通过 contactChannels/service.ts getContactChannelsFromSettings() 函数完全迁移。
-- 本 migration 在支持 Contact Channels 的新代码下清除这些旧字段，
-- 避免白标复制时误携带遗留的格式不匹配的设置数据。

DELETE FROM settings
WHERE key IN ('contact_phone', 'contact_phones', 'contact_wechat', 'contact_wechats', 'contact_qqs')
AND NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
