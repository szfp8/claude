-- 白标 CMS：人工审核发布策略由应用代码强制执行。
-- 本迁移仅清理可能遗留的泛行业 SEO 默认词，不创建或保留已废弃的自动发布配置。

UPDATE settings
SET value=''
WHERE key='site_keywords'
  AND value IN (
    '企业服务,解决方案,服务指南,行业资讯,办理流程',
    '企业服务,解决方案,服务指南,行业资讯,办理流程,'
  );
