-- 客户留言邮箱与后台邮箱回复支持。
ALTER TABLE messages ADD COLUMN email TEXT DEFAULT '';
