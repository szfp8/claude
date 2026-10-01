import type { Bindings } from '../types'
import { submitGoogleIndexing } from './googleIndexing'
import { MIN_INDEXABLE_OPPORTUNITY_SCORE } from './keywordScore'

async function getSetting(env: Bindings, key: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first()
  return (row as any)?.value || null
}

export type SitemapEntry = { loc: string; lastmod?: string }

async function getPublicManagedPaths(env: Bindings): Promise<Set<string>> {
  const visible = new Set<string>(['/', '/service', '/city', '/article', '/about', '/contact'])
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key='page_settings_json'").first()
    const raw = row && typeof (row as any).value === 'string' ? JSON.parse(String((row as any).value)) : {}
    const mapping: Record<string, string> = {
      home: '/', services: '/service', cities: '/city', articles: '/article', about: '/about', contact: '/contact',
    }
    for (const key of Object.keys(mapping)) {
      if (raw?.[key]?.mode === 'hidden' || raw?.[key]?.mode === 'external') visible.delete(mapping[key])
    }
  } catch {
    // 页面配置异常时维持默认公开路径，避免 Sitemap 因后台配置解析失败而变空。
  }
  return visible
}

export async function getSitemapEntries(env: Bindings, siteUrlOverride?: string): Promise<SitemapEntry[]> {
  const site = String(siteUrlOverride || env.SITE_URL || '').trim().replace(/\/$/, '')
  if (!site) return []
  const visiblePaths = await getPublicManagedPaths(env)
  const entries: SitemapEntry[] = []
  const latestArticle = await env.DB.prepare(
    "SELECT MAX(COALESCE(updated_at, published_at, created_at)) AS lastmod FROM articles WHERE status='published'"
  ).first() as any
  const latestContentLastmod = latestArticle?.lastmod ? String(latestArticle.lastmod) : undefined

  const addStatic = (path: string, lastmod?: string) => {
    if (visiblePaths.has(path)) entries.push({ loc: site + path, lastmod })
  }

  // 首页包含最新文章，因此只有首页和文章列表可以可靠地使用“最新文章更新时间”。
  addStatic('/', latestContentLastmod)
  addStatic('/service')
  addStatic('/city')
  addStatic('/article', latestContentLastmod)
  addStatic('/about')
  addStatic('/contact')

  const cities = (await env.DB.prepare(
    'SELECT slug FROM cities WHERE is_active = 1 ORDER BY sort_order LIMIT 200'
  ).all()).results as any[]
  const services = (await env.DB.prepare(
    'SELECT id, slug FROM services WHERE is_active = 1 ORDER BY sort_order LIMIT 50'
  ).all()).results as any[]

  let externalServiceLinks: Record<string, string> = {}
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key='service_external_links'").first()
    const raw = row && typeof (row as any).value === 'string' ? JSON.parse(String((row as any).value)) : {}
    if (raw && typeof raw === 'object') {
      externalServiceLinks = Object.fromEntries(
        Object.entries(raw as Record<string, unknown>)
          .filter(([, value]) => typeof value === 'string' && String(value).trim())
          .map(([key, value]) => [key, String(value).trim()])
      )
    }
  } catch {
    externalServiceLinks = {}
  }
  const isExternalService = (service: any) =>
    !!(externalServiceLinks[String(service.slug)] || externalServiceLinks[String(service.id)])

  // 只把实际由本站渲染的服务页放入 Sitemap；302 外站的服务页不进入自然收录入口。
  for (const service of services) {
    if (!isExternalService(service)) entries.push({ loc: site + '/service/' + service.slug })
  }
  for (const city of cities) entries.push({ loc: site + '/city/' + city.slug })

  // 城市×服务页保持 1000 条上限，且排除实际会 302 到外站的服务。
  // 这样搜索引擎拿到 Sitemap 后，访问 URL 会稳定得到本站 200 页面，而不是先跳外站。
  const internalServiceSlugs = new Set(services.filter((service) => !isExternalService(service)).map((service) => String(service.slug)))
  if (internalServiceSlugs.size) {
    const cityServices = (await env.DB.prepare(
      `SELECT c.slug AS city_slug, s.slug AS service_slug
       FROM keywords k
       JOIN cities c ON c.id = k.city_id
       JOIN services s ON s.id = k.service_id
       WHERE c.is_active = 1 AND s.is_active = 1 AND COALESCE(k.opportunity_score,0) >= ${MIN_INDEXABLE_OPPORTUNITY_SCORE}
       ORDER BY c.sort_order, s.sort_order LIMIT 1000`
    ).all()).results as any[]
    for (const row of cityServices) {
      if (internalServiceSlugs.has(String(row.service_slug))) {
        entries.push({ loc: site + '/city/' + row.city_slug + '/' + row.service_slug })
      }
    }
  }

  const articles = (await env.DB.prepare(
    "SELECT slug, updated_at, published_at, created_at FROM articles WHERE status='published' ORDER BY id DESC LIMIT 5000"
  ).all()).results as any[]
  for (const article of articles) {
    entries.push({
      loc: site + '/article/' + article.slug,
      lastmod: article.updated_at || article.published_at || article.created_at || undefined,
    })
  }

  // 后台启用的四类子项目自动进入 Sitemap；子项目详情页单独收录，根页面仍保留原有 canonical。
  const subprojects = (await env.DB.prepare(
    "SELECT section, slug, updated_at FROM subprojects WHERE is_active=1 ORDER BY section, sort_order, id LIMIT 200"
  ).all()).results as any[]
  for (const project of subprojects) {
    const section = String(project.section || '')
    const slug = String(project.slug || '').trim()
    if (!slug) continue
    const path = section === 'service'
      ? '/service/topic/' + slug
      : section === 'article'
        ? '/article/tag/' + slug
        : section === 'new'
          ? '/new/' + slug
          : section === 'city'
            ? '/city/topic/' + slug
            : ''
    if (path) entries.push({ loc: site + path, lastmod: project.updated_at || undefined })
  }

  const deduped = new Map<string, SitemapEntry>()
  for (const entry of entries) {
    if (!deduped.has(entry.loc)) deduped.set(entry.loc, entry)
  }
  return Array.from(deduped.values())
}

export async function getAllPublishedUrls(env: Bindings, siteUrlOverride?: string): Promise<string[]> {
  return (await getSitemapEntries(env, siteUrlOverride)).map((entry) => entry.loc)
}

async function log(env: Bindings, engine: string, url: string, statusCode: number, response: string) {
  await env.DB.prepare(
    'INSERT INTO submit_logs (engine, url, status_code, response) VALUES (?, ?, ?, ?)'
  ).bind(engine, url, statusCode, response.slice(0, 500)).run()
}

export async function getIndexNowKey(env: Bindings): Promise<string | undefined> {
  const setting = await env.DB.prepare("SELECT value FROM settings WHERE key='indexnow_key'").first()
  return (setting as any)?.value || env.INDEXNOW_KEY
}

// IndexNow：一次性通知公开 URL 的新增、更新或删除。Bing 与其他参与该协议的搜索引擎共享通知；百度普通收录单独使用百度官方提交渠道。
export async function submitIndexNow(env: Bindings, urls: string[], siteUrlOverride?: string) {
  const key = await getIndexNowKey(env)
  if (!key) return { ok: false, skipped: true, error: '未配置 IndexNow Key（系统设置中填写，或设置 secret INDEXNOW_KEY）' }
  const site = (siteUrlOverride || env.SITE_URL || '').replace(/\/$/, '')
  if (!site || site === 'https://your-domain.com') return { ok: false, error: '未配置 SITE_URL（请在 Cloudflare 生产环境变量中设置）' }
  const host = new URL(site).host

  const uniqueUrls = Array.from(new Set(urls))
  const applyCooldown = uniqueUrls.length > 1
  const cooldownKey = 'seo:indexnow:last:' + host
  if (applyCooldown) {
    try {
      const recent = await env.CACHE_KV.get(cooldownKey)
      if (recent) {
        return { ok: false, skipped: true, status: 429, error: 'IndexNow 为避免重复批量提交已进入 10 分钟保护期，请稍后再提交' }
      }
    } catch (e) {
      console.warn('IndexNow cooldown check failed', e)
    }
  }

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: `${site}/${key}.txt`, urlList: uniqueUrls.slice(0, MAX_URLS_PER_INVOCATION) }),
    })
    const response = await res.text()
    await log(env, 'indexnow', Array.from(new Set(urls)).slice(0, MAX_URLS_PER_INVOCATION).join(','), res.status, response)
    if (res.ok && applyCooldown) {
      try { await env.CACHE_KV.put(cooldownKey, new Date().toISOString(), { expirationTtl: INDEXNOW_COOLDOWN_SECONDS }) } catch {}
    }
    return { ok: res.ok, status: res.status, error: res.ok ? undefined : response.slice(0, 300) }
  } catch (e: any) {
    await log(env, 'indexnow', urls.join(','), 0, String(e))
    return { ok: false, error: String(e) }
  }
}

// Bing 自动 URL 通知统一走 IndexNow，不依赖旧 URL Submission API.
export async function submitBing(env: Bindings, urls: string[]) {
  const message = 'Bing：当前模板使用 IndexNow 自动通知；不调用旧 URL Submission API。'
  await log(env, 'bing', urls.join(','), 0, message)
  return { ok: false, skipped: true, status: 0, error: message }
}

// 百度普通收录推送 (需要在百度搜索资源平台获取 token, 存入 settings 表 baidu_token)
export async function submitBaidu(env: Bindings, urls: string[], siteUrlOverride?: string) {
  const token = await getSetting(env, 'baidu_token')
  if (!token) return { ok: false, error: '未配置百度 token（请在系统设置中填写 baidu_token）' }
  const siteUrl = (siteUrlOverride || env.SITE_URL || '').replace(/\/$/, '')
  if (!siteUrl || siteUrl === 'https://your-domain.com') return { ok: false, error: '未配置 SITE_URL' }
  const host = new URL(siteUrl).host
  try {
    const res = await fetch(`http://data.zz.baidu.com/urls?site=${host}&token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: urls.join('\n'),
    })
    await log(env, 'baidu', urls.join(','), res.status, await res.text())
    return { ok: res.ok, status: res.status }
  } catch (e: any) {
    await log(env, 'baidu', urls.join(','), 0, String(e))
    return { ok: false, error: String(e) }
  }
}

// 360 搜索：基础模板以 Sitemap / 站长平台为正式提交渠道，不调用未经官方文档确认的固定推送 URL。
export async function submit360(env: Bindings, urls: string[]) {
  const message = '360：本模板不调用未验证的固定推送接口，请在 360 站长平台提交 /sitemap.xml 或站内数据；公开 URL 已保持可抓取。'
  await log(env, '360', urls.join(','), 0, message)
  return { ok: false, skipped: true, status: 0, error: message }
}
// 搜狗：当前模板以 Sitemap / 站长平台为正式提交渠道，不把历史固定 API 地址作为生产依赖。
export async function submitSogou(env: Bindings, urls: string[]) {
  const message = '搜狗：请在已验证的搜狗站长平台提交 /sitemap.xml 或 URL；公开 URL 已保持可抓取。'
  await log(env, 'sogou', urls.join(','), 0, message)
  return { ok: false, skipped: true, status: 0, error: message }
}
// Google Indexing API（可选，需 GOOGLE_SERVICE_ACCOUNT_JSON secret，见 README 说明）
export async function submitGoogle(env: Bindings, urls: string[]) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) return { ok: false, error: '未配置 GOOGLE_SERVICE_ACCOUNT_JSON' }
  const result = await submitGoogleIndexing(env.GOOGLE_SERVICE_ACCOUNT_JSON, urls)
  await log(env, 'google', urls.join(','), result.ok ? 200 : 0, JSON.stringify(result))
  return result
}

// Google / Bing 的 sitemap ping 端点：免密钥、免申请，直接通知搜索引擎重新抓取 sitemap
// 一键推送到所有已配置的搜索引擎渠道
const MAX_URLS_PER_INVOCATION = 50
const INDEXNOW_COOLDOWN_SECONDS = 600

type WaitUntilContext = {
  waitUntil(promise: Promise<unknown>): void
}

export function notifyPublishedUrl(
  env: Bindings,
  url: string,
  siteUrl: string,
  executionContext: WaitUntilContext,
) {
  executionContext.waitUntil(
    submitAllEngines(env, [url], siteUrl).catch((e) => {
      console.error('published URL SEO push failed', { url, error: String(e) })
    })
  )
}

export function notifyDeletedUrl(
  env: Bindings,
  url: string,
  siteUrl: string,
  executionContext: WaitUntilContext,
) {
  executionContext.waitUntil(
    submitIndexNow(env, [url], siteUrl).catch((e) => {
      console.error('deleted URL IndexNow notification failed', { url, error: String(e) })
    })
  )
}

export async function submitAllEngines(env: Bindings, urls: string[], siteUrlOverride?: string) {
  if (!urls.length) return { skipped: true }
  const selected = Array.from(new Set(urls)).slice(0, MAX_URLS_PER_INVOCATION)
  // 发布后 Sitemap 是实时动态源；通知顺序固定为：百度 → IndexNow → Bing备用 → 360/Sogou站长平台说明。
  const baidu = await submitBaidu(env, selected, siteUrlOverride)
  const indexnow = await submitIndexNow(env, selected, siteUrlOverride)
  const indexNowKey = await getIndexNowKey(env)
  const bing = indexNowKey
    ? { ok: false, skipped: true, reason: '已使用 IndexNow，跳过重复的 Bing URL Submission API' }
    : await submitBing(env, selected)
  const so = await submit360(env, selected)
  const sogou = await submitSogou(env, selected)
  return {
    indexnow, bing, baidu, so, sogou,
    google: { ok: false, skipped: true, reason: '普通行业页面使用 Sitemap + Google Search Console；Indexing API 仅适用于官方允许的特定页面类型' },
    sitemapPing: { ok: false, skipped: true, reason: '不调用已废弃的 Google/Bing Sitemap Ping 端点；Sitemap 本身实时更新' },
    submittedCount: selected.length,
    skippedCount: Math.max(0, Array.from(new Set(urls)).length - selected.length),
  }
}
