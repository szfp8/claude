export type Bindings = {
  DB: D1Database
  CACHE_KV: KVNamespace
  R2_MEDIA: R2Bucket
  AI: Ai
  ASSETS: Fetcher
  SITE_NAME?: string
  SITE_URL?: string
  DEFAULT_CITY?: string
  JWT_SECRET?: string
  SETUP_TOKEN?: string // 可选：设置后 /admin/setup 必须携带该令牌才能创建首个管理员（Cloudflare Secret）
  PBKDF2_ITERATIONS?: string // 可选：密码哈希迭代次数，Free 计划默认 5000，付费计划可调到最高 100000
  INDEXNOW_KEY?: string
  GOOGLE_SERVICE_ACCOUNT_JSON?: string // Google Indexing API 服务账号 JSON（整段内容作为 secret）
  EXTERNAL_AI_API_KEY?: string // 可选：OpenAI-compatible 外部 AI API 密钥（Cloudflare Secret，不入库）
  RESEND_API_KEY?: string // 可选：Resend 事务邮件 API Key（Cloudflare Secret，不入库）
}

export type Variables = {
  isAdmin: boolean
  locale: 'zh-CN' | 'en'
  multilingual: boolean // 前台已启用多种语言：同一 URL 的 HTML 因人而异，不得被边缘缓存
}
