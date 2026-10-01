import type { Context } from 'hono'
import type { Bindings } from '../types'

const PLACEHOLDER = 'https://your-domain.com'

// 一键部署场景下用户很可能没改 wrangler.toml 里的 SITE_URL 占位值，
// 这里在有请求上下文时按当前访问的域名自动兜底，保证 sitemap/canonical 等链接不会指向错误地址。
// 后续绑定自定义域名后，仍可通过修改 SITE_URL 变量强制指定。
export function resolveSiteUrl(c: Context): string {
  const configured = c.env.SITE_URL
  if (configured && configured !== PLACEHOLDER) return configured.replace(/\/$/, '')
  try {
    return new URL(c.req.url).origin
  } catch {
    return (configured || PLACEHOLDER).replace(/\/$/, '')
  }
}

export function isSiteUrlConfigured(env: Bindings): boolean {
  return !!env.SITE_URL && env.SITE_URL !== PLACEHOLDER
}
