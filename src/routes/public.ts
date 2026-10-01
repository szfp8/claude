import { Hono } from 'hono'
import { rateLimit } from '../middleware/security'
import type { Bindings, Variables } from '../types'
import { renderLayout } from '../templates/layout'
import {
  renderHome, renderCityPage, renderCityServicePage, renderArticlePage, renderArticleList, renderNewList, renderSubprojectPage,
  renderServiceList, renderServiceDetail, renderCityList, renderAboutPage, renderContactPage, renderSearchResults,
} from '../templates/public'
import { resolveSiteUrl } from '../utils/siteUrl'
import { shouldSampleView, trackPageView } from '../utils/stats'
import { SUPPORTED, t, type Locale } from '../utils/i18n'
import { getPageSettings } from '../utils/pageSettings'
import { buildLayoutChrome } from '../utils/layoutContext'
import { MIN_INDEXABLE_OPPORTUNITY_SCORE } from '../utils/keywordScore'
import { getServiceExternalLinks } from '../utils/serviceSettings'
import { getAiContentEntryDb } from '../utils/aiContentStore'
import { getImageStore } from '../utils/imageSettings'
import { getContactMethods } from '../utils/contactSettings'
import { getSiteProfile } from '../utils/siteProfile'
import { getPageContact } from '../utils/pageContacts'
import { subprojectPagePath, type SubprojectSection } from '../utils/subprojects'
import { escapeLike, safeInternalPath } from '../utils/geo'

export const publicRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// 前台 HTML 内容来自 D1/设置，不能让 Cloudflare 按无 Cache-Control 的默认规则缓存长达数小时。
// 采用短缓存 + 后台刷新，兼顾页面设置即时性与 Workers CPU/数据库负载。
publicRoutes.use('*', async (c, next) => {
  await next()
  const contentType = c.res.headers.get('content-type') || ''
  if (c.req.method === 'GET' && c.res.status === 200 && contentType.includes('text/html')) {
    c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
    c.header('Cloudflare-CDN-Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  }
})

async function getSettings(env: Bindings): Promise<Record<string, string>> {
  if (!env.DB) return {}
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM settings WHERE key NOT LIKE 'ai_page:%'").all()
    const map: Record<string, string> = {}
    for (const r of results as any[]) map[r.key] = r.value
    return map
  } catch (e) {
    console.error('D1 settings read failed; using defaults', e)
    return {}
  }
}
function withHomeContactDescription(description: string, methods: ReturnType<typeof getContactMethods>, locale: Locale): string {
  const base = String(description || '').trim().slice(0, 180)
  const parts: string[] = []
  if (methods.phones.length) parts.push((locale === 'zh-CN' ? '电话' : 'Phone') + ': ' + methods.phones.join(', '))
  if (methods.wechats.length) parts.push((locale === 'zh-CN' ? '微信' : 'WeChat') + ': ' + methods.wechats.join(', '))
  if (methods.qqs.length) parts.push('QQ: ' + methods.qqs.join(', '))
  const contact = parts.join(' · ')
  return contact ? [base, contact].filter(Boolean).join(' · ').slice(0, 320) : base
}

async function getActiveSubprojects(env: Bindings, section: SubprojectSection): Promise<any[]> {
  try {
    const rows = (await env.DB.prepare(
      'SELECT id, section, name, slug, label_zh, label_en, title_zh, title_en, subtitle_zh, subtitle_en, content_zh, content_en, seo_title_zh, seo_title_en, seo_description_zh, seo_description_en, seo_keywords_zh, seo_keywords_en, layout, is_active, sort_order FROM subprojects WHERE section=? AND is_active=1 ORDER BY sort_order, id LIMIT 50'
    ).bind(section).all()).results as any[]
    return rows.map((row) => ({ ...row, frontend_path: subprojectPagePath(section, String(row.slug || '')) }))
  } catch (e) {
    // 专题表/专题数据异常时，不影响服务、城市和资讯主列表。
    console.error('D1 subprojects read failed; continuing without subprojects', e)
    return []
  }
}

async function getSubprojectWithItems(env: Bindings, section: SubprojectSection, slug: string): Promise<{ project: any; items: any[] } | null> {
  const project = await env.DB.prepare('SELECT * FROM subprojects WHERE section=? AND slug=? AND is_active=1 LIMIT 1').bind(section, slug).first() as any
  if (!project) return null
  const meta: any = section === 'service' ? { type: 'service', table: 'services', fields: 'id,name,slug,summary,sort_order', active: 'is_active=1', order: 'si.sort_order,s.sort_order,s.id' }
    : section === 'city' ? { type: 'city', table: 'cities', fields: 'id,name,slug,province,tier,sort_order', active: 'is_active=1', order: 'si.sort_order,s.sort_order,s.id' }
    : { type: 'article', table: 'articles', fields: 'id,title AS name,slug,summary,category,published_at,created_at', active: "status='published'", order: 'si.sort_order,s.published_at DESC,s.id DESC' }
  const items = (await env.DB.prepare(
    'SELECT s.' + meta.fields.split(',').join(',s.') + ' FROM ' + meta.table + ' s JOIN subproject_items si ON si.item_id=s.id AND si.item_type=? WHERE si.subproject_id=? AND ' + meta.active + ' ORDER BY ' + meta.order + ' LIMIT 200'
  ).bind(meta.type, Number(project.id)).all()).results as any[]
  return { project, items }
}

// ---- 语言切换：写入 cookie 后跳回原页面 ----
publicRoutes.get('/lang/:code', (c) => {
  const code = c.req.param('code')
  const back = c.req.query('back') || '/'
  if (SUPPORTED.includes(code as Locale)) {
    c.header('Set-Cookie', `lang=${code}; Path=/; Max-Age=31536000; SameSite=Lax`)
  }
  return c.redirect(safeInternalPath(back))
})

publicRoutes.get('/', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  c.executionCtx.waitUntil(trackPageView(env))
  const settingsPromise = getSettings(env)
  let settings: Record<string, string> = {}
  let cities: any[] = [], services: any[] = [], articles: any[] = []
  if (env.DB) {
    const reads = await Promise.all([
      env.DB.prepare('SELECT id, name, slug, province FROM cities WHERE is_active = 1 ORDER BY sort_order LIMIT 200').all().catch((e) => { console.error('D1 cities read failed', e); return { results: [] } as any }),
      env.DB.prepare('SELECT id, name, slug, icon, summary FROM services WHERE is_active = 1 ORDER BY sort_order LIMIT 50').all().catch((e) => { console.error('D1 services read failed', e); return { results: [] } as any }),
      env.DB.prepare("SELECT id, title, slug, category, summary, published_at FROM articles WHERE status='published' ORDER BY published_at DESC LIMIT 6").all().catch((e) => { console.error('D1 articles read failed', e); return { results: [] } as any }),
      settingsPromise.catch(() => ({})),
    ])
    cities = reads[0].results as any[]
    services = reads[1].results as any[]
    articles = reads[2].results as any[]
    settings = reads[3] as Record<string, string>
  } else {
    settings = await settingsPromise
  }
  const pageSettings = getPageSettings(settings)
  const homePage = pageSettings.home
  const globalContacts = getContactMethods(settings)
  const homeContact = getPageContact(settings, 'home', globalContacts)
  const homeSeoContacts = { ...globalContacts, wechats: homeContact.wechats, qqs: homeContact.qqs }
  const imageStore = getImageStore(settings)
  if (homePage.mode === 'hidden') return c.notFound()
  if (homePage.mode === 'external' && homePage.externalUrl) return c.redirect(homePage.externalUrl, 302)
  const contactMessage = c.req.query('sent') === '1' ? t(locale, 'contact.success') : ''
  const body = renderHome({ cities: cities as any, services: services as any, articles: articles as any, siteName: (settings.site_name || env.SITE_NAME || '网站内容平台'), settings, contactMessage, pageSettings, locale, images: imageStore, pageContact: homeContact })
  const homeDescription = withHomeContactDescription(settings.site_description || '', homeSeoContacts, locale)
  return c.html(renderLayout({
    title: settings.site_title || (settings.site_name || env.SITE_NAME || '网站内容平台'),
    description: homeDescription,
    keywords: (locale === 'zh-CN' ? homePage.seoKeywordsZh : homePage.seoKeywordsEn) || settings.site_keywords,
    siteUrl, siteName: (settings.site_name || env.SITE_NAME || '网站内容平台'), canonical: siteUrl + '/', locale, currentPath: '/',
    ...buildLayoutChrome(settings, locale, homeSeoContacts),
  }, body))
})

// ---- 服务列表 / 服务详情 ----
publicRoutes.get('/service', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  c.executionCtx.waitUntil(trackPageView(env))
  const services = (await env.DB.prepare('SELECT id, name, slug, icon, summary FROM services WHERE is_active = 1 ORDER BY sort_order LIMIT 50').all()).results
  const settings = await getSettings(env)
  const page = getPageSettings(settings).services
  const imageStore = getImageStore(settings)
  const globalContacts = getContactMethods(settings)
  const pageContact = getPageContact(settings, 'services', globalContacts)
  if (page.mode === 'hidden') return c.notFound()
  if (page.mode === 'external' && page.externalUrl) return c.redirect(page.externalUrl, 302)
  const externalLinks = getServiceExternalLinks(settings)
  const subprojects = await getActiveSubprojects(env, 'service')
  const siteProfile = getSiteProfile(settings, env.SITE_NAME || '')
  const body = renderServiceList(services as any, locale, externalLinks, page, pageContact, subprojects, siteProfile, imageStore)
  const title = (locale === 'zh-CN' ? page.titleZh : page.titleEn) || (locale === 'zh-CN' ? page.labelZh : page.labelEn)
  const description = (locale === 'zh-CN' ? page.subtitleZh : page.subtitleEn) || ('围绕' + siteProfile.topic + '提供服务范围、适用场景与办理信息。')
  return c.html(renderLayout({
    title: `${title} - ${(settings.site_name || env.SITE_NAME || '网站内容平台')}`,
    description,
    keywords: (locale === 'zh-CN' ? page.seoKeywordsZh : page.seoKeywordsEn) || page.labelZh + ',' + page.labelEn,
    siteUrl, siteName: (settings.site_name || env.SITE_NAME || '网站内容平台'), canonical: `${siteUrl}/service`, locale, currentPath: '/service',
    ...buildLayoutChrome(settings, locale),
  }, body))
})


publicRoutes.get('/service/topic/:slug', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  const slug = c.req.param('slug')
  const data = await getSubprojectWithItems(env, 'service', slug)
  if (!data) return c.notFound()
  const settings = await getSettings(env)
  const pageTitle = locale === 'zh-CN' ? (data.project.seo_title_zh || data.project.title_zh || data.project.label_zh) : (data.project.seo_title_en || data.project.title_en || data.project.label_en || data.project.label_zh)
  const description = locale === 'zh-CN' ? (data.project.seo_description_zh || data.project.subtitle_zh || data.project.content_zh || '') : (data.project.seo_description_en || data.project.subtitle_en || data.project.content_en || '')
  const keywords = locale === 'zh-CN' ? data.project.seo_keywords_zh : data.project.seo_keywords_en
  const body = renderSubprojectPage({ section: 'service', subproject: data.project, items: data.items, locale })
  return c.html(renderLayout({
    title: pageTitle + ' - ' + (settings.site_name || env.SITE_NAME || '网站内容平台'),
    description, keywords, siteUrl, siteName: settings.site_name || env.SITE_NAME || '网站内容平台',
    canonical: siteUrl + '/service/topic/' + slug, locale, currentPath: '/service/topic/' + slug,
    ...buildLayoutChrome(settings, locale, getContactMethods(settings)),
  }, body))
})

publicRoutes.get('/service/:slug', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  c.executionCtx.waitUntil(trackPageView(env))
  const slug = c.req.param('slug')
  const service = await env.DB.prepare('SELECT * FROM services WHERE slug = ?').bind(slug).first()
  if (!service) return c.notFound()
  const serviceRow = service as any
  if (Number(serviceRow.is_active || 0) !== 1) return c.notFound()
  const settings = await getSettings(env)
  const imageStore = getImageStore(settings)
  const externalUrl = getServiceExternalLinks(settings)[serviceRow.slug] || getServiceExternalLinks(settings)[String(serviceRow.id)] || ''
  if (externalUrl) return c.redirect(externalUrl, 302)
  const cities = (await env.DB.prepare(`SELECT id, name, slug, province, seo_title, seo_description, seo_keywords, tier
     FROM cities
     WHERE is_active = 1
       AND EXISTS (
         SELECT 1 FROM keywords k
         WHERE k.service_id = ? AND k.city_id = cities.id AND COALESCE(k.opportunity_score,0) >= ?
       )
     ORDER BY sort_order LIMIT 200`).bind((serviceRow.id), MIN_INDEXABLE_OPPORTUNITY_SCORE).all()).results
  const globalContacts = getContactMethods(settings)
  const pageContact = getPageContact(settings, 'service:' + serviceRow.slug, globalContacts)
  const siteProfile = getSiteProfile(settings, env.SITE_NAME || '')
  const relatedArticles = (await env.DB.prepare("SELECT id, title, slug, summary, category, published_at FROM articles WHERE status='published' AND service_id = ? ORDER BY published_at DESC LIMIT 6").bind(serviceRow.id).all()).results
  const body = renderServiceDetail({ service: serviceRow, cities: cities as any, locale, aiContent: await getAiContentEntryDb(env, settings, 'services', serviceRow.slug), image: imageStore.services[serviceRow.slug], pageContact, relatedArticles: relatedArticles as any, siteProfile })
  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: serviceRow.name,
    description: serviceRow.seo_description || serviceRow.summary || '',
    serviceType: serviceRow.name,
    provider: { '@type': 'Organization', name: (settings.site_name || env.SITE_NAME || '网站内容平台'), url: siteUrl },
    areaServed: cities.map((city: any) => ({ '@type': 'City', name: city.name })).slice(0, 100),
  }
  return c.html(renderLayout({
    title: serviceRow.seo_title || `${serviceRow.name} - ${(settings.site_name || env.SITE_NAME || '网站内容平台')}`,
    description: serviceRow.seo_description || serviceRow.summary || '',
    keywords: serviceRow.seo_keywords || serviceRow.name,
    extraJsonLd: [serviceSchema],
    siteUrl, siteName: (settings.site_name || env.SITE_NAME || '网站内容平台'), canonical: `${siteUrl}/service/${slug}`, locale, currentPath: `/service/${slug}`,
    ...buildLayoutChrome(settings, locale),
  }, body))
})

// ---- 城市列表 ----
publicRoutes.get('/city', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  c.executionCtx.waitUntil(trackPageView(env))
  const cities = (await env.DB.prepare('SELECT id, name, slug, province, is_active, sort_order, seo_title, seo_description, seo_keywords, tier FROM cities WHERE is_active = 1 ORDER BY sort_order LIMIT 200').all()).results
  const settings = await getSettings(env)
  const page = getPageSettings(settings).cities
  const imageStore = getImageStore(settings)
  const globalContacts = getContactMethods(settings)
  const pageContact = getPageContact(settings, 'cities', globalContacts)
  if (page.mode === 'hidden') return c.notFound()
  if (page.mode === 'external' && page.externalUrl) return c.redirect(page.externalUrl, 302)
  const subprojects = await getActiveSubprojects(env, 'city')
  const siteProfile = getSiteProfile(settings, env.SITE_NAME || '')
  const body = renderCityList(cities as any, locale, page, pageContact, subprojects, siteProfile, imageStore)
  const title = (locale === 'zh-CN' ? page.titleZh : page.titleEn) || (locale === 'zh-CN' ? page.labelZh : page.labelEn)
  const description = (locale === 'zh-CN' ? page.subtitleZh : page.subtitleEn) || `覆盖${cities.length}个服务地区，提供本地化${siteProfile.topic}信息与服务。`
  return c.html(renderLayout({
    title: `${title} - ${(settings.site_name || env.SITE_NAME || '网站内容平台')}`,
    description,
    keywords: (locale === 'zh-CN' ? page.seoKeywordsZh : page.seoKeywordsEn) || (page.labelZh + ',' + page.labelEn),
    siteUrl, siteName: (settings.site_name || env.SITE_NAME || '网站内容平台'), canonical: `${siteUrl}/city`, locale, currentPath: '/city',
    ...buildLayoutChrome(settings, locale),
  }, body))
})


publicRoutes.get('/city/topic/:slug', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  const slug = c.req.param('slug')
  const data = await getSubprojectWithItems(env, 'city', slug)
  if (!data) return c.notFound()
  const settings = await getSettings(env)
  const pageTitle = locale === 'zh-CN' ? (data.project.seo_title_zh || data.project.title_zh || data.project.label_zh) : (data.project.seo_title_en || data.project.title_en || data.project.label_en || data.project.label_zh)
  const description = locale === 'zh-CN' ? (data.project.seo_description_zh || data.project.subtitle_zh || '') : (data.project.seo_description_en || data.project.subtitle_en || '')
  const keywords = locale === 'zh-CN' ? data.project.seo_keywords_zh : data.project.seo_keywords_en
  const body = renderSubprojectPage({ section: 'city', subproject: data.project, items: data.items, locale })
  return c.html(renderLayout({
    title: pageTitle + ' - ' + (settings.site_name || env.SITE_NAME || '网站内容平台'),
    description, keywords, siteUrl, siteName: settings.site_name || env.SITE_NAME || '网站内容平台',
    canonical: siteUrl + '/city/topic/' + slug, locale, currentPath: '/city/topic/' + slug,
    ...buildLayoutChrome(settings, locale, getContactMethods(settings)),
  }, body))
})

publicRoutes.get('/city/:slug', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  c.executionCtx.waitUntil(trackPageView(env))
  const slug = c.req.param('slug')
  const city = await env.DB.prepare('SELECT * FROM cities WHERE slug = ?').bind(slug).first()
  if (!city) return c.notFound()
  const cityRow = city as any
  if (Number(cityRow.is_active || 0) !== 1) return c.notFound()
  const settings = await getSettings(env)
  const externalLinks = getServiceExternalLinks(settings)
  const serviceRows = (await env.DB.prepare(`SELECT id, name, slug, icon, summary, seo_title, seo_description, seo_keywords, demand_weight
     FROM services
     WHERE is_active = 1
       AND EXISTS (
         SELECT 1 FROM keywords k
         WHERE k.city_id = ? AND k.service_id = services.id AND COALESCE(k.opportunity_score,0) >= ?
       )
     ORDER BY sort_order LIMIT 50`).bind((city as any).id, MIN_INDEXABLE_OPPORTUNITY_SCORE).all()).results as any[]
  const services = serviceRows.filter((row) => !externalLinks[String(row.slug || '')])
  const articles = (await env.DB.prepare("SELECT id, title, slug, summary, category, published_at FROM articles WHERE status='published' AND city_id = ? ORDER BY published_at DESC LIMIT 6").bind((city as any).id).all()).results
  const searchCities = (await env.DB.prepare('SELECT id, name, slug, province FROM cities WHERE is_active = 1 ORDER BY sort_order LIMIT 200').all()).results
  const globalContacts = getContactMethods(settings)
  const pageContact = getPageContact(settings, 'city:' + cityRow.slug, globalContacts)
  const imageStore = getImageStore(settings)
  const siteProfile = getSiteProfile(settings, env.SITE_NAME || '')
  const title = cityRow.seo_title || `${cityRow.name}${siteProfile.topic} - ${(settings.site_name || env.SITE_NAME || '网站内容平台')}`
  const description = cityRow.seo_description || `${cityRow.name}提供${siteProfile.topic}相关本地服务信息，包含适用场景、服务范围、流程和注意事项。`
  const keywords = cityRow.seo_keywords || `${cityRow.name}${siteProfile.topic},${cityRow.name}服务`
  const body = renderCityPage({ city: city as any, services: services as any, articles: articles as any, locale, aiContent: await getAiContentEntryDb(env, settings, 'cities', cityRow.slug), image: imageStore.cities[cityRow.slug], pageContact, searchCities: searchCities as any, siteProfile })
  const cityWebPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: siteUrl + '/city/' + slug,
    about: { '@type': 'City', name: cityRow.name },
  }
  return c.html(renderLayout({
    title, description, keywords,
    siteUrl, siteName: (settings.site_name || env.SITE_NAME || '网站内容平台'), canonical: `${siteUrl}/city/${slug}`, locale, currentPath: `/city/${slug}`,
    extraJsonLd: [cityWebPageJsonLd],
    ...buildLayoutChrome(settings, locale),
  }, body))
})

publicRoutes.get('/city/:citySlug/:serviceSlug', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  c.executionCtx.waitUntil(trackPageView(env))
  const { citySlug, serviceSlug } = c.req.param()
  const settings = await getSettings(env)
  const externalUrl = getServiceExternalLinks(settings)[serviceSlug] || ''
  if (externalUrl) return c.redirect(externalUrl, 302)
  const city = await env.DB.prepare('SELECT * FROM cities WHERE slug = ?').bind(citySlug).first()
  const service = await env.DB.prepare('SELECT * FROM services WHERE slug = ?').bind(serviceSlug).first()
  if (!city || !service) return c.notFound()
  const cityRow = city as any, serviceRow = service as any
  if (Number(cityRow.is_active || 0) !== 1 || Number(serviceRow.is_active || 0) !== 1) return c.notFound()
  const imageStore = getImageStore(settings)
  const globalContacts = getContactMethods(settings)
  const pageContact = getPageContact(settings, 'landing:' + citySlug + '-' + serviceSlug, globalContacts)
  const title = serviceRow.seo_title
    ? `${cityRow.name}${serviceRow.seo_title}`
    : `${cityRow.name}${serviceRow.name} - ${(settings.site_name || env.SITE_NAME || '网站内容平台')}`
  const description = serviceRow.seo_description || `${cityRow.name}${serviceRow.name}服务，${serviceRow.summary || ''}`
  const keywords = serviceRow.seo_keywords || `${cityRow.name}${serviceRow.name}`
  const keywordRow = await env.DB.prepare(
    'SELECT opportunity_score FROM keywords WHERE city_id=? AND service_id=? AND COALESCE(opportunity_score,0)>=65 LIMIT 1'
  ).bind(cityRow.id, serviceRow.id).first() as any
  if (!keywordRow) return c.notFound()

  const landingKey = `${citySlug}-${serviceSlug}`
  const siteProfile = getSiteProfile(settings, env.SITE_NAME || '')
  const relatedArticles = (await env.DB.prepare("SELECT id, title, slug, summary, category, published_at FROM articles WHERE status='published' AND city_id = ? AND service_id = ? ORDER BY published_at DESC LIMIT 6").bind(cityRow.id, serviceRow.id).all()).results
  const body = renderCityServicePage({ city: city as any, service: service as any, locale, aiContent: await getAiContentEntryDb(env, settings, 'landing', landingKey), image: imageStore.cities[citySlug] || imageStore.services[serviceSlug], pageContact, relatedArticles: relatedArticles as any, siteProfile })
  return c.html(renderLayout({
    title, description, keywords,
    siteUrl, siteName: (settings.site_name || env.SITE_NAME || '网站内容平台'), canonical: `${siteUrl}/city/${citySlug}/${serviceSlug}`,
    locale, currentPath: `/city/${citySlug}/${serviceSlug}`,
    ...buildLayoutChrome(settings, locale),
  }, body))
})

// /article/ 统一收敛到规范地址，避免尾斜杠进入参数路由。
publicRoutes.get('/article/', (c) => c.redirect('/article', 301))

publicRoutes.get('/article', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  c.executionCtx.waitUntil(trackPageView(env))
  const category = String(c.req.query('category') || '').trim().slice(0, 80)
  let articles: any[] = []
  try {
    const result = category
      ? await env.DB.prepare("SELECT id, title, slug, summary, substr(content, 1, 600) AS content_excerpt, category, published_at FROM articles WHERE status='published' AND category=? ORDER BY published_at DESC LIMIT 30").bind(category).all()
      : await env.DB.prepare("SELECT id, title, slug, summary, substr(content, 1, 600) AS content_excerpt, category, published_at FROM articles WHERE status='published' ORDER BY published_at DESC LIMIT 30").all()
    articles = result.results as any[]
  } catch (e) {
    // 资讯查询异常时给出可渲染的空列表，避免全站统一 500。
    console.error('D1 articles list read failed', e)
  }
  const settings = await getSettings(env)
  const page = getPageSettings(settings).articles
  const globalContacts = getContactMethods(settings)
  const pageContact = getPageContact(settings, 'articles', globalContacts)
  if (page.mode === 'hidden') return c.notFound()
  if (page.mode === 'external' && page.externalUrl) return c.redirect(page.externalUrl, 302)
  const subprojects = await getActiveSubprojects(env, 'article')
  const siteProfile = getSiteProfile(settings, env.SITE_NAME || '')
  const body = renderArticleList(articles, locale, page, pageContact, subprojects, siteProfile)
  const title = (locale === 'zh-CN' ? page.titleZh : page.titleEn) || (locale === 'zh-CN' ? page.labelZh : page.labelEn)
  const description = (locale === 'zh-CN' ? page.subtitleZh : page.subtitleEn) || (
    siteProfile.topic
      ? ('围绕' + siteProfile.topic + '持续更新相关动态、实务信息与解决方案。')
      : (locale === 'zh-CN' ? '持续更新已发布的资讯与实务内容。' : 'Latest published insights and practical information.')
  )
  return c.html(renderLayout({
    title: `${title} - ${(settings.site_name || env.SITE_NAME || '网站内容平台')}`,
    description,
    keywords: page.labelZh + ',' + page.labelEn,
    siteUrl, siteName: (settings.site_name || env.SITE_NAME || '网站内容平台'), canonical: `${siteUrl}/article`, locale, currentPath: '/article',
    ...buildLayoutChrome(settings, locale),
  }, body))
})


publicRoutes.get('/article/tag/:slug', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  const slug = c.req.param('slug')
  const data = await getSubprojectWithItems(env, 'article', slug)
  if (!data) return c.notFound()
  const settings = await getSettings(env)
  const pageTitle = locale === 'zh-CN' ? (data.project.seo_title_zh || data.project.title_zh || data.project.label_zh) : (data.project.seo_title_en || data.project.title_en || data.project.label_en || data.project.label_zh)
  const description = locale === 'zh-CN' ? (data.project.seo_description_zh || data.project.subtitle_zh || '') : (data.project.seo_description_en || data.project.subtitle_en || '')
  const keywords = locale === 'zh-CN' ? data.project.seo_keywords_zh : data.project.seo_keywords_en
  const body = renderSubprojectPage({ section: 'article', subproject: data.project, items: data.items, locale })
  return c.html(renderLayout({
    title: pageTitle + ' - ' + (settings.site_name || env.SITE_NAME || '网站内容平台'),
    description, keywords, siteUrl, siteName: settings.site_name || env.SITE_NAME || '网站内容平台',
    canonical: siteUrl + '/article/tag/' + slug, locale, currentPath: '/article/tag/' + slug,
    ...buildLayoutChrome(settings, locale, getContactMethods(settings)),
  }, body))
})

publicRoutes.get('/new', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  const articles = (await env.DB.prepare("SELECT id, title, slug, summary, category, published_at FROM articles WHERE status='published' ORDER BY published_at DESC LIMIT 30").all()).results
  const settings = await getSettings(env)
  const subprojects = await getActiveSubprojects(env, 'new')
  const siteProfile = getSiteProfile(settings, env.SITE_NAME || '')
  const body = renderNewList(articles as any, subprojects, locale, siteProfile)
  return c.html(renderLayout({
    title: (locale === 'zh-CN'
      ? (siteProfile.topic ? siteProfile.topic + '新闻专题' : '新闻专题')
      : (siteProfile.topic ? siteProfile.topic + ' news topics' : 'News topics')) + ' - ' + (settings.site_name || env.SITE_NAME || '网站内容平台'),
    description: siteProfile.topic
      ? (locale === 'zh-CN' ? siteProfile.topic + '相关专题、实务信息与解决方案。' : 'Topics, practical information and solutions about ' + siteProfile.topic + '.')
      : (locale === 'zh-CN' ? '已发布的专题与实务信息。' : 'Published topic and practical information.'),
    keywords: siteProfile.primaryKeywords.slice(0, 5).join(','),
    siteUrl, siteName: settings.site_name || env.SITE_NAME || '网站内容平台', canonical: siteUrl + '/new', locale, currentPath: '/new',
    ...buildLayoutChrome(settings, locale, getContactMethods(settings)),
  }, body))
})

publicRoutes.get('/new/:slug', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  const slug = c.req.param('slug')
  const data = await getSubprojectWithItems(env, 'new', slug)
  if (!data) return c.notFound()
  const settings = await getSettings(env)
  const pageTitle = locale === 'zh-CN' ? (data.project.seo_title_zh || data.project.title_zh || data.project.label_zh) : (data.project.seo_title_en || data.project.title_en || data.project.label_en || data.project.label_zh)
  const description = locale === 'zh-CN' ? (data.project.seo_description_zh || data.project.subtitle_zh || '') : (data.project.seo_description_en || data.project.subtitle_en || '')
  const keywords = locale === 'zh-CN' ? data.project.seo_keywords_zh : data.project.seo_keywords_en
  const body = renderSubprojectPage({ section: 'new', subproject: data.project, items: data.items, locale })
  return c.html(renderLayout({
    title: pageTitle + ' - ' + (settings.site_name || env.SITE_NAME || '网站内容平台'),
    description, keywords, siteUrl, siteName: settings.site_name || env.SITE_NAME || '网站内容平台',
    canonical: siteUrl + '/new/' + slug, locale, currentPath: '/new/' + slug,
    ...buildLayoutChrome(settings, locale, getContactMethods(settings)),
  }, body))
})

publicRoutes.get('/article/:slugOrId', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  const slugOrId = String(c.req.param('slugOrId') || '').trim()

  const article = /^\d+$/.test(slugOrId)
    ? await env.DB.prepare("SELECT * FROM articles WHERE id = ? AND status='published'").bind(Number(slugOrId)).first()
    : await env.DB.prepare("SELECT * FROM articles WHERE slug = ? AND status='published'").bind(slugOrId).first()
  if (!article) return c.notFound()

  const art = article as any
  const storedSlug = String(art.slug || '').trim().replace(/^\/+|\/+$/g, '')
  // 历史文章可能没有 slug：这类文章直接使用 /article/{id}，不能重定向到一个尚未写入 D1 的虚拟 slug。
  const publicSlug = storedSlug || String(art.id)
  if (storedSlug && slugOrId !== storedSlug) {
    return c.redirect('/article/' + encodeURIComponent(storedSlug), 301)
  }
  if (shouldSampleView()) {
    c.executionCtx.waitUntil(env.DB.prepare('UPDATE articles SET views = views + 1 WHERE id = ?').bind((article as any).id).run())
    c.executionCtx.waitUntil(trackPageView(env, true))
  }
  const settings = await getSettings(env)
  const globalContacts = getContactMethods(settings)
  const pageContact = getPageContact(settings, 'article:' + art.id, globalContacts)
  const body = renderArticlePage({ ...art, summary: art.summary, seo_keywords: art.seo_keywords }, locale, pageContact)
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: art.seo_title || art.title,
    description: art.seo_description || art.summary || '',
    datePublished: art.published_at || art.created_at,
    dateModified: art.updated_at || art.published_at || art.created_at,
    author: { '@type': 'Organization', name: (settings.site_name || env.SITE_NAME || '网站内容平台') },
    publisher: { '@type': 'Organization', name: (settings.site_name || env.SITE_NAME || '网站内容平台') },
    keywords: String(art.seo_keywords || '').split(/[,，;；、\n]+/).map((v: string) => v.trim()).filter(Boolean).slice(0, 5),
    mainEntityOfPage: `${siteUrl}/article/${publicSlug}`,
  }
  return c.html(renderLayout({
    title: art.seo_title || `${art.title} - ${(settings.site_name || env.SITE_NAME || '网站内容平台')}`,
    description: art.seo_description || art.summary || '',
    keywords: art.seo_keywords || '',
    siteUrl, siteName: (settings.site_name || env.SITE_NAME || '网站内容平台'), canonical: `${siteUrl}/article/${publicSlug}`, locale, currentPath: `/article/${publicSlug}`,
    extraJsonLd: [articleJsonLd],
    ...buildLayoutChrome(settings, locale),
  }, body))
})

// ---- 关于我们 ----
publicRoutes.get('/about', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  const settings = await getSettings(env)
  const pageSettings = getPageSettings(settings)
  const aboutPage = pageSettings.about
  const pageContact = getPageContact(settings, 'about', getContactMethods(settings))
  if (aboutPage.mode === 'hidden') return c.notFound()
  if (aboutPage.mode === 'external' && aboutPage.externalUrl) return c.redirect(aboutPage.externalUrl, 302)
  const contactMessage = c.req.query('sent') === '1' ? t(locale, 'contact.success') : ''
  const body = renderAboutPage(settings, (settings.site_name || env.SITE_NAME || '网站内容平台'), locale, contactMessage, aboutPage, pageContact)
  const aboutTitle = aboutPage.titleZh || aboutPage.titleEn || t(locale, 'about.title')
  const aboutSubtitle = aboutPage.subtitleZh || aboutPage.subtitleEn || settings.site_description || ''
  return c.html(renderLayout({
    title: `${aboutTitle} - ${(settings.site_name || env.SITE_NAME || '网站内容平台')}`,
    description: aboutSubtitle,
    keywords: (locale === 'zh-CN' ? aboutPage.seoKeywordsZh : aboutPage.seoKeywordsEn) || settings.site_keywords,
    siteUrl, siteName: (settings.site_name || env.SITE_NAME || '网站内容平台'), canonical: `${siteUrl}/about`, locale, currentPath: '/about',
    ...buildLayoutChrome(settings, locale),
  }, body))
})

// ---- 联系我们：前台表单 + D1 留言 ----
publicRoutes.get('/contact', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  const settings = await getSettings(env)
  const pageSettings = getPageSettings(settings)
  const contactPage = pageSettings.contact
  const pageContact = getPageContact(settings, 'contact', getContactMethods(settings))
  if (contactPage.mode === 'hidden') return c.notFound()
  if (contactPage.mode === 'external' && contactPage.externalUrl) return c.redirect(contactPage.externalUrl, 302)
  const message = c.req.query('sent') === '1'
    ? t(locale, 'contact.success')
    : c.req.query('error') === 'phone'
      ? t(locale, 'contact.phone_required')
      : ''
  const body = renderContactPage(settings, locale, message, contactPage, pageContact)
  const contactTitle = locale === 'zh-CN' ? contactPage.titleZh : contactPage.titleEn
  const contactSubtitle = locale === 'zh-CN' ? contactPage.subtitleZh : contactPage.subtitleEn
  return c.html(renderLayout({
    title: `${contactTitle || t(locale, 'contact.title')} - ${(settings.site_name || env.SITE_NAME || '网站内容平台')}`,
    description: contactSubtitle || t(locale, 'contact.subtitle'),
    keywords: (locale === 'zh-CN' ? contactPage.seoKeywordsZh : contactPage.seoKeywordsEn) || settings.site_keywords,
    siteUrl, siteName: (settings.site_name || env.SITE_NAME || '网站内容平台'), canonical: `${siteUrl}/contact`, locale, currentPath: '/contact',
    ...buildLayoutChrome(settings, locale),
  }, body))
})

publicRoutes.post('/contact', rateLimit(8, 60, 'contact'), async (c) => {
  const env = c.env
  const body = await c.req.parseBody()
  // 隐藏字段为简单反垃圾蜜罐，正常访客不会填写。
  if (String(body.website || '').trim()) {
    return c.redirect('/contact?sent=1')
  }
  const safeName = String(body.name || '').trim().slice(0, 100)
  const safePhone = String(body.phone || '').trim().slice(0, 50)
  const safeEmail = String(body.email || '').trim().toLowerCase().slice(0, 254)
  if (safeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) return c.redirect('/contact?error=email')
  const safeCity = String(body.city || '').trim().slice(0, 100)
  const safeService = String(body.service || '').trim().slice(0, 100)
  const safeContent = String(body.content || '').trim().slice(0, 2000)
  if (!safePhone) return c.redirect('/contact?error=phone')
  try {
    await env.DB.prepare(
      'INSERT INTO messages (name, phone, email, city, service, content) VALUES (?, ?, ?, ?, ?, ?)'
    ) .bind(safeName, safePhone, safeEmail, safeCity, safeService, safeContent).run()
  } catch (e) {
    console.error('public contact message insert failed', e)
    return c.text('留言暂时提交失败，请稍后再试。', 503)
  }
  return c.redirect('/contact?sent=1')
})

// ---- 搜索：同时匹配 服务 / 城市 / 资讯 ----
publicRoutes.get('/search', async (c) => {
  const env = c.env
  const siteUrl = resolveSiteUrl(c)
  const locale = c.get('locale')
  const q = c.req.query('q') || ''
  const selectedCity = c.req.query('city') || ''
  const settings = await getSettings(env)
  let cities: any[] = [], services: any[] = [], articles: any[] = []
  if (q || selectedCity) {
    const like = `%${escapeLike(q)}%`
    const cityClause = selectedCity ? ' AND c.slug = ?' : ''
    const cityParams = selectedCity ? [selectedCity] : []
    const cityRow = selectedCity
      ? await env.DB.prepare('SELECT id, name, slug, province FROM cities WHERE is_active=1 AND slug=? LIMIT 1').bind(selectedCity).first()
      : null
    ;[cities, services, articles] = await Promise.all([
      q
        ? (await env.DB.prepare(`SELECT id, name, slug, province FROM cities WHERE is_active=1 AND name LIKE ? ESCAPE char(92)${selectedCity ? ' AND slug=?' : ''} LIMIT 10`).bind(...([like, ...cityParams])).all()).results as any[]
        : cityRow ? [cityRow] : [],
      q
        ? (await env.DB.prepare(`SELECT id, name, slug, icon, summary FROM services WHERE is_active=1 AND name LIKE ? ESCAPE char(92) LIMIT 10`).bind(like).all()).results as any[]
        : [],
      q
        ? (await env.DB.prepare(`SELECT a.id, a.title, a.slug, a.summary, a.category, a.published_at FROM articles a WHERE a.status='published' AND (a.title LIKE ? ESCAPE char(92) OR a.summary LIKE ? ESCAPE char(92))${selectedCity ? ' AND a.city_id = (SELECT id FROM cities WHERE slug=? AND is_active=1)' : ''} ORDER BY a.published_at DESC LIMIT 20`).bind(...([like, like, ...(selectedCity ? [selectedCity] : [])])).all()).results as any[]
        : [],
    ])
  }
  const body = renderSearchResults({ q, cities, services, articles, locale })
  const query = new URLSearchParams()
  if (q) query.set('q', q)
  if (selectedCity) query.set('city', selectedCity)
  const queryString = query.toString()
  return c.html(renderLayout({
    title: `"${q}"的搜索结果 - ${(settings.site_name || env.SITE_NAME || '网站内容平台')}`,
    siteUrl, siteName: (settings.site_name || env.SITE_NAME || '网站内容平台'), canonical: `${siteUrl}/search${queryString ? '?' + queryString : ''}`, robots: 'noindex,follow',
    locale, currentPath: `/search${queryString ? '?' + queryString : ''}`,
    ...buildLayoutChrome(settings, locale, getContactMethods(settings)),
  }, body))
})
