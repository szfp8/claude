import { escapeHtml } from './layout'
import { t, type Locale } from '../utils/i18n'
import type { ManagedPage } from '../utils/pageSettings'
import { getContactMethods } from '../utils/contactSettings'
import type { AiContentEntry } from '../utils/aiContentStore'
import type { ImageEntry, ImageStore } from '../utils/imageSettings'
import type { PageContactMethods } from '../utils/pageContacts'
import { filterContactChannels, getContactChannelsFromSettings } from '../modules/contactChannels'
import { getSiteProfile, type SiteProfile } from '../utils/siteProfile'

export type City = { id: number; name: string; slug: string; province?: string }
export type Service = { id: number; name: string; slug: string; icon?: string; summary?: string }
export type Article = { id: number; title: string; slug: string; summary?: string; content_excerpt?: string; category?: string; published_at?: string; city_id?: number }

const AI_RICH_TEXT_TAGS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'br'])

function articlePublicPath(item: { id: number; slug?: string }): string {
  const key = String(item.slug || '').trim() || String(item.id)
  return '/article/' + encodeURIComponent(key)
}

function articleListSummary(item: Article): string {
  const summary = String(item.summary || '').trim()
  if (summary) return summary.slice(0, 100)
  return String(item.content_excerpt || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

function normalizeArticleKeywords(value: string): string[] {
  return Array.from(new Set(String(value || '').split(/[,，;；、\n]+/).map((v) => v.trim()).filter(Boolean))).slice(0, 5)
}

export function sanitizeAiPublicHtml(value: unknown): string {
  let html = String(value || '')
    .replace(/<(script|style|iframe|object|embed|form|textarea|select)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|form|textarea|select)[^>]*>/gi, '')
    .replace(/javascript\s*:/gi, '')
    // 历史 AI 采集稿可能已经把“AI辅助/AI生成”声明保存进正文；这些内部生产标记不在前台展示。
    .replace(/本文由\s*AI(?:辅助|生成)[^。！？]{0,120}(?:仅供参考，)?具体以最新官方政策为准[。！？]?/gi, '')
    .replace(/本文由\s*AI(?:辅助|生成)[^。！？]{0,120}(?:仅供参考)[。！？]?/gi, '')
    .replace(/AI\s*图解\s*[·•\-:]?\s*一图看懂/gi, '重点摘要 · 一图看懂')
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (full, tagName) => {
      const tag = String(tagName).toLowerCase()
      if (!AI_RICH_TEXT_TAGS.has(tag)) return ''
      return full.startsWith('</') ? '</' + tag + '>' : '<' + tag + '>'
    })
    .trim()
  return html.slice(0, 20000)
}

export function sanitizePublicCardSvg(value: unknown): string {
  const raw = String(value || '')
    .slice(0, 50000)
    .replace(/AI\s*图解\s*[·•\-:]?\s*一图看懂/gi, '文章要点')
    .replace(/重点摘要\s*[·•\-:]?\s*一图看懂/gi, '文章要点')
    .replace(/\bAI\s*辅助(?:采集|生成)?\b/gi, '')
    .replace(/>要点1</g, '>核心信息<')
    .replace(/>要点2</g, '>企业影响<')
    .replace(/>要点3</g, '>执行建议<')
    .replace(/>要点4</g, '>风险提醒<')
    .replace(/<\/?(?:script|foreignObject|iframe|object|embed|image|a|style|link|animate|set|use)\b[^>]*>/gi, '')
    .replace(/<\/?(?!svg\b|defs\b|linearGradient\b|stop\b|rect\b|circle\b|text\b|g\b)[a-z][a-z0-9:-]*\b[^>]*>/gi, '')
    .replace(/\s+on[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|xlink:href|src|style)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+([a-z_:][-a-z0-9_.:]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (_full, name, dq, sq, bare) => {
      const allowed = new Set([
        'viewBox','xmlns','font-family','x1','y1','x2','y2','offset','stop-color',
        'width','height','rx','fill','stroke','stroke-width','cx','cy','r','x','y',
        'text-anchor','font-size','font-weight','transform',
      ])
      if (!allowed.has(String(name))) return ''
      const attr = String(dq ?? sq ?? bare ?? '')
      if (/javascript:|vbscript:|data:/i.test(attr)) return ''
      if (/url\(\s*(?!#)[^)]+\)/i.test(attr)) return ''
      return ' ' + name + '="' + attr.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"'
    })
    .replace(/\s{2,}/g, ' ')
    .trim()

  const start = raw.indexOf('<svg')
  const end = raw.lastIndexOf('</svg>')
  if (start < 0 || end < start) return ''
  return raw.slice(start, end + 6).trim()
}

export function renderSafeSvgImage(value: unknown, alt = '文章要点'): string {
  const svg = sanitizePublicCardSvg(value)
  if (!svg) return ''
  return '<img class="article-visual-svg" src="data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg) + '" alt="' + escapeHtml(alt) + '" loading="lazy" decoding="async" />'
}


function normalizeArticleSlides(value: unknown): Array<{ heading: string; text: string }> {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 4).map((item: any, index) => {
      let heading = String(item?.heading || '').trim()
      const text = String(item?.text || '').trim()
      const generic = /^要点(?:\s*)[1-4]?$/.test(heading)
      if (generic || !heading) heading = ['核心信息', '企业影响', '执行建议', '风险提醒'][index] || '文章要点'
      return { heading: heading.slice(0, 30), text: text.slice(0, 180) }
    }).filter((item) => item.text)
  } catch {
    return []
  }
}

export function renderSubprojectTagBar(subprojects: any[], locale: Locale = 'zh-CN'): string {
  if (!subprojects || !subprojects.length) return ''
  const label = locale === 'zh-CN' ? '子项目 / 专题' : 'Topics & subprojects'
  const note = locale === 'zh-CN' ? '按子项目进入独立内容页面。' : 'Open a dedicated page for each topic.'
  return '<section class="section container subproject-tag-section">' +
    '<div class="section-title"><div><h2>' + escapeHtml(label) + '</h2><p class="section-caption">' + escapeHtml(note) + '</p></div></div>' +
    '<nav class="subproject-tag-list" aria-label="子项目">' +
    subprojects.map((item) => '<a class="subproject-tag" href="' + escapeHtml(item.frontend_path || '#') + '">' + escapeHtml(locale === 'zh-CN' ? (item.label_zh || item.name) : (item.label_en || item.label_zh || item.name)) + '</a>').join('') +
    '</nav></section>'
}

export function renderSubprojectPage(params: {
  section: 'service' | 'article' | 'new' | 'city'
  subproject: any
  items: any[]
  locale?: Locale
}): string {
  const section = params.section
  const subproject = params.subproject
  const items = params.items || []
  const locale = params.locale || 'zh-CN'
  const title = locale === 'zh-CN'
    ? (subproject.title_zh || subproject.label_zh || subproject.name)
    : (subproject.title_en || subproject.label_en || subproject.label_zh || subproject.name)
  const subtitle = locale === 'zh-CN' ? subproject.subtitle_zh : subproject.subtitle_en
  const content = locale === 'zh-CN' ? subproject.content_zh : subproject.content_en
  const layout = subproject.layout === 'list' ? 'list' : subproject.layout === 'feature' ? 'feature' : 'grid'
  const sectionLabel = section === 'service'
    ? (locale === 'zh-CN' ? '服务子项目' : 'Service topic')
    : section === 'city'
      ? (locale === 'zh-CN' ? '城市子项目' : 'City topic')
      : section === 'new'
        ? (locale === 'zh-CN' ? '新闻专题' : 'News topic')
        : (locale === 'zh-CN' ? '资讯子项目' : 'Article topic')
  const cards = items.map((item) => {
    const href = section === 'service'
      ? '/service/' + item.slug
      : section === 'city'
        ? '/city/' + item.slug
        : articlePublicPath({ id: Number(item.id || 0), slug: item.slug })
    const name = section === 'service' || section === 'city' ? item.name : item.title
    const summary = item.summary || (section === 'city' ? item.province || '' : '')
    if (layout === 'list') {
      return '<a class="subproject-item subproject-item-list" href="' + escapeHtml(href) + '"><div><strong>' + escapeHtml(name) + '</strong>' +
        (summary ? '<p>' + escapeHtml(String(summary).slice(0, 140)) + '</p>' : '') + '</div><span>→</span></a>'
    }
    return '<a class="card subproject-item ' + (layout === 'feature' ? 'subproject-item-feature' : '') + '" href="' + escapeHtml(href) + '">' +
      '<span class="badge">' + escapeHtml(sectionLabel) + '</span><h3>' + escapeHtml(name) + '</h3>' +
      (summary ? '<p>' + escapeHtml(String(summary).slice(0, 140)) + '</p>' : '') +
      '<span class="subproject-item-link">' + escapeHtml(locale === 'zh-CN' ? '查看详情' : 'View details') + ' →</span></a>'
  }).join('')
  return '<section class="hero page-heading-hero subproject-hero"><div class="container">' +
    '<span class="article-list-kicker">' + escapeHtml(sectionLabel) + '</span><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(subtitle || '') + '</p></div></section>' +
    (content ? '<section class="section container"><article class="managed-seo-card subproject-content"><div class="page-content-readable">' + renderManagedRichText(content) + '</div></article></section>' : '') +
    '<section class="section container"><div class="section-title"><div><h2>' + escapeHtml(locale === 'zh-CN' ? '本子项目内容' : 'Content in this topic') +
    '</h2><p class="section-caption">' + escapeHtml(locale === 'zh-CN' ? '共 ' + items.length + ' 项' : items.length + ' items') + '</p></div></div>' +
    (items.length ? (layout === 'list' ? '<div class="subproject-list">' + cards + '</div>' : '<div class="grid grid-3 subproject-grid">' + cards + '</div>') :
      '<div class="card"><p style="color:var(--muted)">' + escapeHtml(locale === 'zh-CN' ? '这个子项目暂时没有绑定内容。请在后台子项目管理中选择内容。' : 'No content has been assigned to this topic yet.') + '</p></div>') +
    '</section>'
}

export function renderNewList(articles: Article[], subprojects: any[] = [], locale: Locale = 'zh-CN', siteProfile?: SiteProfile): string {
  const topic = siteProfile?.topic || ''
  const heading = topic
    ? (locale === 'zh-CN' ? topic + '新闻专题' : topic + ' news topics')
    : (locale === 'zh-CN' ? '新闻专题' : 'News topics')
  const kicker = topic ? '<div class="article-list-kicker">' + escapeHtml(topic) + '</div>' : ''
  const description = topic
    ? (locale === 'zh-CN' ? '按专题标签浏览当前站点内容。' : 'Browse content grouped by the current site topic.')
    : ''
  return '<section class="hero article-list-hero"><div class="container article-list-hero-inner">' +
    kicker + '<h1>' + escapeHtml(heading) + '</h1>' +
    (description ? '<p>' + escapeHtml(description) + '</p>' : '') + '</div></section>' +
    renderSubprojectTagBar(subprojects, locale) +
    '<section class="section container"><div class="section-title"><div><h2>' + escapeHtml(locale === 'zh-CN' ? '最新资讯' : 'Latest news') + '</h2>' +
    '<p class="section-caption">' + escapeHtml(locale === 'zh-CN' ? '已发布 ' + articles.length + ' 篇' : articles.length + ' published articles') + '</p></div></div>' +
    '<div class="grid grid-3 article-card-grid">' +
    (articles.length ? articles.map((item) => '<a class="card article-summary-card" href="' + articlePublicPath(item) + '"><span class="badge">' + escapeHtml(item.category || '资讯') +
      '</span><h3>' + escapeHtml(item.title) + '</h3><p>' + escapeHtml(articleListSummary(item)) + '</p><span class="article-summary-link">' +
      escapeHtml(t(locale, 'common.learn_more')) + ' →</span></a>').join('') : '<p style="color:var(--muted)">' + escapeHtml(t(locale, 'common.no_data')) + '</p>') +
    '</div></section>'
}



function renderArticleVisual(slidesJson: unknown, cardSvg: unknown): string {
  const slides = normalizeArticleSlides(slidesJson)
  if (slides.length) {
    return '<div class="article-insight-grid" aria-label="文章要点">' +
      slides.map((slide, index) => '<div class="article-insight-card">' +
        '<span class="article-insight-index">' + (index + 1) + '</span>' +
        '<div class="article-insight-body"><h3>' + escapeHtml(slide.heading) + '</h3>' +
        '<p>' + escapeHtml(slide.text) + '</p></div></div>').join('') +
      '</div>'
  }
  if (cardSvg) return '<div class="article-visual-fallback" aria-label="文章要点">' + renderSafeSvgImage(cardSvg) + '</div>'
  return ''
}

export function renderManagedRichText(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const cleaned = sanitizeAiPublicHtml(raw)
  if (/<(?:p|h2|h3|ul|ol|li|strong|em|br)\b/i.test(cleaned)) return cleaned
  return escapeHtml(raw)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => '<p>' + part.replace(/\n/g, '<br>') + '</p>')
    .join('')
}


/**
 * 后台页面正文属于 SEO/信息补充，不直接参与首页、服务、城市或资讯列表的主布局。
 * 统一放在页面主体底部，运营编辑正文时不会把卡片和列表整体顶乱。
 */
export function renderManagedSeoSection(
  value: unknown,
  locale: Locale = 'zh-CN',
  titleZh = '页面服务说明',
  titleEn = 'Page information',
): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const title = locale === 'zh-CN' ? titleZh : titleEn
  const kicker = locale === 'zh-CN' ? '内容与服务说明' : 'Information & services'
  return `
<section class="section managed-seo-section">
  <div class="container">
    <article class="managed-seo-card">
      <div class="managed-seo-kicker">${escapeHtml(kicker)}</div>
      <h2 class="managed-seo-title">${escapeHtml(title)}</h2>
      <div class="page-content-readable managed-content">${renderManagedRichText(raw)}</div>
    </article>
  </div>
</section>`
}

// 注意：这里只翻译界面上的固定文案（标题、按钮、提示语）。
// 城市名/服务名/文章正文来自数据库（运营者录入或AI采集生成的中文内容），不做机器翻译。
export function renderSearchBox(defaultCity?: string, locale: Locale = 'zh-CN', cities: City[] = []): string {
  const selected = String(defaultCity || '').trim()
  const activeCities = cities.length ? cities : []
  return `<form class="search-box" action="/search" method="get">
  <select name="city">
    <option value="">全部城市</option>
    ${activeCities.map((item) => `<option value="${escapeHtml(item.slug)}" ${selected === item.name || selected === item.slug ? 'selected' : ''}>${escapeHtml(item.name)}${locale === 'zh-CN' ? '市' : ''}</option>`).join('')}
  </select>
  <input name="q" placeholder="${escapeHtml(t(locale, 'nav.search_placeholder'))}" />
  <button type="submit">${escapeHtml(t(locale, 'nav.search_button'))}</button>
</form>`
}

export function renderHome(params: {
  cities: City[]; services: Service[]; articles: Article[]; siteName: string;
  settings?: Record<string, string>; contactMessage?: string; pageSettings?: Record<string, ManagedPage>; locale?: Locale; images?: ImageStore; pageContact?: PageContactMethods; searchCities?: City[]
}): string {
  const { cities, services, articles, siteName, settings = {}, contactMessage = '', pageSettings = {}, locale = 'zh-CN', images, searchCities = cities } = params
  const homePage = pageSettings.home
  const siteProfile = getSiteProfile(settings, siteName)
  const homeTitle = locale === 'zh-CN' ? homePage?.titleZh : homePage?.titleEn
  const homeSubtitle = locale === 'zh-CN' ? homePage?.subtitleZh : homePage?.subtitleEn
  const homeContent = locale === 'zh-CN' ? homePage?.contentZh : homePage?.contentEn
  const featuredServices = services.slice(0, 8)
  const quickServices = services.slice(0, 5)
  const featuredCities = cities.slice(0, 24)
  const featuredArticles = articles.slice(0, 6)
  const contactLinkLabel = locale === 'zh-CN' ? '联系我们' : 'Contact us'
  const topic = siteProfile.topic || siteProfile.industry || ''
  const pageLabels = {
    services: locale === 'zh-CN' ? (pageSettings.services?.labelZh || '服务项目') : (pageSettings.services?.labelEn || 'Services'),
    cities: locale === 'zh-CN' ? (pageSettings.cities?.labelZh || '服务城市') : (pageSettings.cities?.labelEn || 'Cities'),
    articles: locale === 'zh-CN' ? (pageSettings.articles?.labelZh || '新闻资讯') : (pageSettings.articles?.labelEn || 'Insights'),
  }
  const contactNote = locale === 'zh-CN'
    ? '可以提交具体需求或联系方式。'
    : 'Submit a request or contact details for follow-up.'
  return `
<section class="hero page-heading-hero home-hero${images?.home?.url ? ' has-home-image' : ''}">
  ${images?.home?.url ? `<div class="home-hero-bg" aria-hidden="true"><img src="${escapeHtml(images.home.url)}" alt="" loading="eager" width="1600" height="620" /></div>` : ''}
  <div class="container home-hero-inner">
    ${topic ? `<span class="home-hero-kicker">${escapeHtml(topic)}</span>` : ''}
    <h1>${escapeHtml(homeTitle || settings.site_title || siteName || t(locale, 'home.hero.title'))}</h1>
    ${homeSubtitle ? `<p>${escapeHtml(homeSubtitle)}</p>` : ''}
    ${renderSearchBox(undefined, locale, searchCities)}
  </div>
</section>





<section class="section home-intro-section" ${!homeContent ? 'hidden' : ''}>
  <div class="container">
    <article class="home-intro-card">
      <div class="home-intro-heading">
        <span class="home-intro-kicker">${escapeHtml(locale === 'zh-CN' ? '服务内容介绍' : 'Service information')}</span>
        <h2>${escapeHtml(topic || siteName)}</h2>
      </div>
      <div class="page-content-readable managed-content home-intro-content">
        ${homeContent ? renderManagedRichText(homeContent) : ''}
      </div>
    </article>
  </div>
</section>
<section class="section container home-services-section" ${!featuredServices.length ? 'hidden' : ''}>
  <div class="section-title">
    <div>
      <h2>${escapeHtml(pageLabels.services)}</h2>
      <p class="section-caption">${escapeHtml(topic ? (locale === 'zh-CN' ? '重点' + topic + '服务' : topic + ' services') : (locale === 'zh-CN' ? '当前配置的服务项目' : 'Configured services'))}</p>
    </div>
    <a href="/service">${escapeHtml(t(locale, 'home.services.more'))} →</a>
  </div>
  <div class="grid grid-4 service-card-grid">
    ${featuredServices.map((item) => `
      <a class="card service-card home-service-card" href="/service/${item.slug}">
        ${images?.services?.[item.slug]?.url ? `<div class="service-card-image"><img src="${escapeHtml(images.services[item.slug].url)}" alt="${escapeHtml(images.services[item.slug].alt || item.name)}" loading="lazy" width="520" height="220" /></div>` : ''}
        <div class="service-card-body">
          <div class="service-card-top">
            <span class="service-card-icon" aria-hidden="true">${escapeHtml(item.icon || '▦')}</span>
            <span class="service-card-arrow" aria-hidden="true">→</span>
          </div>
          <h3>${escapeHtml(item.name)}</h3>
          ${item.summary ? `<p>${escapeHtml(item.summary.slice(0, 88))}</p>` : ''}
          <span class="service-card-link">${escapeHtml(t(locale, 'common.learn_more'))} →</span>
        </div>
      </a>`).join('')}
  </div>
</section>



<section class="section container" ${!cities.length ? 'hidden' : ''}>
  <div class="section-title">
    <div>
      <h2>${escapeHtml(pageLabels.cities)}</h2>
      <p class="section-caption">${escapeHtml(locale === 'zh-CN' ? `覆盖 ${cities.length} 个服务城市` : `Serving ${cities.length} cities`)}</p>
    </div>
    <a href="/city">${escapeHtml(t(locale, 'home.cities.more'))} →</a>
  </div>
  <div class="city-tags home-city-tags">
    ${featuredCities.map((item) => `<a class="city-tag" href="/city/${item.slug}">${escapeHtml(item.name)}</a>`).join('')}
  </div>
  ${cities.length > featuredCities.length ? `<p class="section-footnote">${escapeHtml(locale === 'zh-CN' ? `还有 ${cities.length - featuredCities.length} 个城市可在“服务城市”中查看。` : `${cities.length - featuredCities.length} more cities are available on the Cities page.`)}</p>` : ''}
</section>

<section class="section container" ${!featuredArticles.length ? 'hidden' : ''}>
  <div class="section-title">
    <div>
      <h2>${escapeHtml(pageLabels.articles)}</h2>
      <p class="section-caption">${escapeHtml(locale === 'zh-CN' ? '已发布内容' : 'Published content')}</p>
    </div>
    <a href="/article">${escapeHtml(t(locale, 'home.articles.more'))} →</a>
  </div>
  <div class="grid grid-3 article-card-grid home-news-grid">
    ${featuredArticles.length ? featuredArticles.map((item) => `
      <a class="card article-summary-card" href="${articlePublicPath(item)}">
        <span class="badge">${escapeHtml(item.category || '资讯')}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(articleListSummary(item).slice(0, 86))}</p>
        <span class="article-summary-link">${escapeHtml(t(locale, 'common.learn_more'))} →</span>
      </a>`).join('') : `<p style="color:var(--muted)">${escapeHtml(t(locale, 'common.no_data'))}</p>`}
  </div>
</section>

<section class="section container home-contact-cta">
  <div class="home-contact-cta-card">
    <div>
      <span class="home-contact-cta-kicker">${escapeHtml(locale === 'zh-CN' ? '联系我们' : 'Contact')}</span>
      <h2>${escapeHtml(topic ? (locale === 'zh-CN' ? '需要了解' + topic + '相关信息？' : 'Need information about ' + topic + '?') : (locale === 'zh-CN' ? '需要了解更多信息？' : 'Need more information?'))}</h2>
      <p>${escapeHtml(contactNote)}</p>
    </div>
    <a class="btn" href="/contact">${escapeHtml(contactLinkLabel)} →</a>
  </div>
</section>

${contactMessage ? `<section class="section container"><p class="contact-success">${escapeHtml(contactMessage)}</p></section>` : ''}
`
}


// ---- 城市与文章详情页（保持原有详情模板，不参与列表页版式调整） ----
export function renderCityPage(params: { city: City; services: Service[]; articles: Article[]; locale?: Locale; aiContent?: AiContentEntry; image?: ImageEntry; pageContact?: PageContactMethods; searchCities?: City[]; siteProfile?: SiteProfile }): string {
  const { city, services, articles, aiContent, image, locale = 'zh-CN', searchCities = [], siteProfile } = params
  const topic = siteProfile?.topic || siteProfile?.industry || ''
  return `
<section class="hero page-heading-hero">
  <div class="container">
    <h1>${escapeHtml(city.name)}${topic ? ' · ' + escapeHtml(topic) : ''}</h1>
    ${(aiContent?.summary || topic) ? `<p>${escapeHtml(aiContent?.summary || ('围绕' + city.name + '用户的' + topic + '需求提供相关信息。'))}</p>` : ''}
    ${renderSearchBox(city.name, locale, searchCities)}
  </div>
</section>
${(image?.url || aiContent?.content) ? `<section class="section container page-content-section"><div class="card page-content-card">${image?.url ? `<div class="page-content-media"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || city.name)}" loading="lazy" width="1200" height="520" /></div>` : ""}${aiContent?.content ? `<div class="page-content-readable ai-content">${sanitizeAiPublicHtml(aiContent.content)}</div>` : ""}</div></section>` : ""}
<section class="section container">
  <div class="section-title"><h2>${escapeHtml(city.name)}${topic ? ' · ' + escapeHtml(topic) : ''}${escapeHtml(locale === 'zh-CN' ? '服务' : ' services')}</h2></div>
  <div class="grid grid-5">
    ${services.map((s) => `
      <a class="card" href="/city/${city.slug}/${s.slug}">
        <h3>${escapeHtml(city.name)}${escapeHtml(s.name)}</h3>
        <p>${escapeHtml(s.summary || '')}</p>
      </a>`).join('')}
  </div>
</section>
<section class="section container">
  <div class="section-title"><h2>${escapeHtml(city.name)}${escapeHtml(locale === 'zh-CN' ? '相关资讯' : ' related articles')}</h2></div>
  <div class="grid grid-3">
    ${articles.length ? articles.map((a) => `
      <a class="card" href="${articlePublicPath(a)}">
        <h3>${escapeHtml(a.title)}</h3>
        <p>${escapeHtml((a.summary || '').slice(0, 60))}</p>
      </a>`).join('') : `<p style="color:var(--muted)">${escapeHtml(t(locale, 'common.no_data'))}</p>`}
  </div>
</section>

`
}



export function renderCityServicePage(params: { city: City; service: Service; locale?: Locale; aiContent?: AiContentEntry; image?: ImageEntry; pageContact?: PageContactMethods; relatedArticles?: Article[]; siteProfile?: SiteProfile }): string {
  const { city, service, aiContent, image, locale = 'zh-CN', relatedArticles = [], siteProfile } = params
  const topic = siteProfile?.topic || siteProfile?.industry || ''
  const heroMeta = [service.summary || '', topic].filter(Boolean).join(' · ')
  return `
<section class="hero page-heading-hero">
  <div class="container">
    <h1>${escapeHtml(city.name)}${escapeHtml(service.name)}</h1>
    ${heroMeta ? `<p>${escapeHtml(heroMeta)}</p>` : ''}
  </div>
</section>
${(image?.url || aiContent?.content) ? `<section class="section container page-content-section"><div class="card page-content-card">${image?.url ? `<div class="page-content-media"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || city.name + service.name)}" loading="lazy" width="1200" height="520" /></div>` : ""}${aiContent?.content ? `<div class="page-content-readable ai-content">${sanitizeAiPublicHtml(aiContent.content)}</div>` : ""}</div></section>` : ""}
${relatedArticles.length ? '<section class="section container"><div class="section-title"><h2>' + escapeHtml(locale === 'zh-CN' ? '相关资讯' : 'Related articles') + '</h2></div><div class="grid grid-3">' + relatedArticles.map((a) => '<a class="card article-summary-card" href="' + articlePublicPath(a) + '"><span class="badge">' + escapeHtml(a.category || '资讯') + '</span><h3>' + escapeHtml(a.title) + '</h3><p>' + escapeHtml((a.summary || '').slice(0, 90)) + '</p><span class="article-summary-link">' + escapeHtml(locale === 'zh-CN' ? '查看详情' : 'View details') + ' →</span></a>').join('') + '</div></section>' : ''}
`
}



export function renderArticlePage(a: {
  title: string; summary?: string; content: string; seo_keywords?: string; category?: string; source_name?: string; source_url?: string; published_at?: string
  card_svg?: string; slides_json?: string; ai_generated?: number; cover_image?: string
}, locale: Locale = 'zh-CN', pageContact?: PageContactMethods): string {
  const summary = String(a.summary || '').trim()
  const keywords = normalizeArticleKeywords(a.seo_keywords || '')
  return `
<section class="hero article-hero">
  <div class="container article-hero-inner">
    <div class="article-meta-badge">${escapeHtml(a.category || '资讯')}</div>
    <h1>${escapeHtml(a.title)}</h1>
    ${summary ? `<p class="article-summary">${escapeHtml(summary)}</p>` : ''}
    ${(() => {
      const cover = String(a.cover_image || '').trim()
      if (!cover) return ''
      if (!(cover.startsWith('/media/') || cover.startsWith('https://') || cover.startsWith('http://'))) return ''
      return '<div class="article-cover-wrap" style="margin-top:16px"><img class="article-cover-image" src="' + escapeHtml(cover) + '" alt="" loading="eager" decoding="async" style="max-width:100%;border-radius:12px;display:block" /></div>'
    })()}
    <p>发布时间：${escapeHtml(a.published_at || '')}${a.source_name ? ' · 参考来源：' + escapeHtml(a.source_name) : ''}</p>
    ${keywords.length ? `<div class="city-tags" style="margin-top:8px">${keywords.map((keyword) => `<span class="city-tag">${escapeHtml(keyword)}</span>`).join('')}</div>` : ''}
  </div>
</section>
<section class="section container" style="max-width:900px">
  ${a.card_svg || a.slides_json ? `
  <div class="article-visual-card">
    ${renderArticleVisual(a.slides_json, a.card_svg)}
  </div>
  ` : ''}
  <div class="card article-content-card">
    <div class="ai-content article-content">${sanitizeAiPublicHtml(a.content)}</div>
  </div>
  <p class="article-source-note">
    ${a.source_url ? `原文参考：<a href="${escapeHtml(a.source_url)}" target="_blank" rel="nofollow noopener">${escapeHtml(a.source_name || '来源链接')}</a>` : ''}
  </p>
</section>
`
}


export function renderArticleList(articles: Article[], locale: Locale = 'zh-CN', page?: ManagedPage, pageContact?: PageContactMethods, subprojects: any[] = [], siteProfile?: SiteProfile): string {
  const title = locale === 'zh-CN' ? page?.titleZh : page?.titleEn
  const subtitle = locale === 'zh-CN' ? page?.subtitleZh : page?.subtitleEn
  const content = locale === 'zh-CN' ? page?.contentZh : page?.contentEn
  return `
<section class="hero article-list-hero">
  <div class="container article-list-hero-inner">
    ${siteProfile?.topic ? `<div class="article-list-kicker">${escapeHtml(siteProfile.topic)}</div>` : ''}
    <h1>${escapeHtml(title || t(locale, 'home.articles.title'))}</h1>
    ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
  </div>
</section>

<section class="section container">
  <div class="section-title">
    <div>
      <h2>${escapeHtml(page?.[locale === 'zh-CN' ? 'labelZh' : 'labelEn'] || (locale === 'zh-CN' ? '新闻资讯' : 'Insights'))}</h2>
      <p class="section-caption">${escapeHtml(locale === 'zh-CN' ? `已发布 ${articles.length} 篇` : `${articles.length} published articles`)}</p>
    </div>
  </div>
  <div class="grid grid-3 article-card-grid">
    ${articles.length ? articles.map((item) => `
      <a class="card article-summary-card" href="${articlePublicPath(item)}">
        <span class="badge">${escapeHtml(item.category || '资讯')}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml((item.summary || '').slice(0, 100))}</p>
        <span class="article-summary-link">${escapeHtml(t(locale, 'common.learn_more'))} →</span>
      </a>`).join('') : `<p style="color:var(--muted)">${escapeHtml(t(locale, 'common.no_data'))}</p>`}
  </div>
</section>

${renderSubprojectTagBar(subprojects, locale)}
${renderManagedSeoSection(content, locale, '资讯说明', 'Information')}
`
}


export function renderServiceList(
  services: Service[],
  locale: Locale = 'zh-CN',
  externalLinks: Record<string, string> = {},
  page?: ManagedPage,
  pageContact?: PageContactMethods,
  subprojects: any[] = [],
  siteProfile?: SiteProfile,
  images?: ImageStore,
): string {
  const title = locale === 'zh-CN' ? page?.titleZh : page?.titleEn
  const subtitle = locale === 'zh-CN' ? page?.subtitleZh : page?.subtitleEn
  const content = locale === 'zh-CN' ? page?.contentZh : page?.contentEn
  return `
<section class="hero page-heading-hero">
  <div class="container">
    <h1>${escapeHtml(title || t(locale, 'service.list_title'))}</h1>
    ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
  </div>
</section>

<section class="section container">
  <div class="section-title">
    <div>
      <h2>${escapeHtml(page?.[locale === 'zh-CN' ? 'labelZh' : 'labelEn'] || (locale === 'zh-CN' ? '服务项目' : 'Services'))}</h2>
      <p class="section-caption">${escapeHtml(locale === 'zh-CN' ? `共 ${services.length} 项` : `${services.length} services`)}</p>
    </div>
  </div>
  <div class="grid grid-4 service-card-grid">
    ${services.map((item) => `
      <a class="card service-card" href="${escapeHtml(externalLinks[item.slug] || ('/service/' + item.slug))}"${externalLinks[item.slug] ? ' target="_blank" rel="noopener noreferrer"' : ''}>
        ${images?.services?.[item.slug]?.url ? `<div class="service-card-image"><img src="${escapeHtml(images.services[item.slug].url)}" alt="${escapeHtml(images.services[item.slug].alt || item.name)}" loading="lazy" width="520" height="220" /></div>` : ''}
        <div class="service-card-top">
          <span class="service-card-icon" aria-hidden="true">${escapeHtml(item.icon || '▦')}</span>
          <span class="service-card-arrow" aria-hidden="true">→</span>
        </div>
        <h3>${escapeHtml(item.name)}</h3>
         ${item.summary ? `<p>${escapeHtml(item.summary.slice(0, 100))}</p>` : ''}
        <span class="service-card-link">${escapeHtml(t(locale, 'common.learn_more'))} →</span>
      </a>`).join('')}
  </div>
</section>

${renderManagedSeoSection(content, locale, '服务项目说明', 'Service information')}
`
}


export function renderServiceDetail(params: { service: Service; cities: City[]; locale?: Locale; aiContent?: AiContentEntry; image?: ImageEntry; pageContact?: PageContactMethods; relatedArticles?: Article[]; siteProfile?: SiteProfile }): string {
  const { service, cities, aiContent, image, locale = 'zh-CN', relatedArticles = [], siteProfile } = params
  const topic = siteProfile?.topic || siteProfile?.industry || ''
  const heroMeta = [aiContent?.summary || service.summary || '', topic].filter(Boolean).join(' · ')
  return `
<section class="hero page-heading-hero">
  <div class="container">
    <h1>${escapeHtml(service.name)}</h1>
    ${heroMeta ? `<p>${escapeHtml(heroMeta)}</p>` : ''}
    ${renderSearchBox(undefined, locale, cities)}
  </div>
</section>
${(image?.url || aiContent?.content) ? `<section class="section container page-content-section"><div class="card page-content-card">${image?.url ? `<div class="page-content-media"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || service.name)}" loading="lazy" width="1200" height="520" /></div>` : ""}${aiContent?.content ? `<div class="page-content-readable ai-content">${sanitizeAiPublicHtml(aiContent.content)}</div>` : ""}</div></section>` : ""}
<section class="section container">
  <div class="section-title"><h2>${escapeHtml(locale === 'zh-CN' ? '选择所在地区' : 'Choose a service area')}</h2></div>
  <div class="city-tags">
    ${cities.map((item) => `<a class="city-tag" href="/city/${item.slug}/${service.slug}">${escapeHtml(item.name)}${escapeHtml(service.name)}</a>`).join('')}
  </div>
</section>
<section class="section container">
  <div class="card">
    <h3>${escapeHtml(t(locale, 'service.why_us'))}：${escapeHtml(service.name)}</h3>
    <p>${escapeHtml(topic
      ? (locale === 'zh-CN' ? '围绕' + topic + '提供专业信息，包含适用场景、办理路径、注意事项和下一步行动。' : 'Practical ' + topic + ' information covering use cases, next steps, key notes and actions.')
      : (locale === 'zh-CN' ? '这里显示当前服务的公开说明、适用场景、办理路径、注意事项和下一步行动。' : 'This area provides the current service description, use cases, next steps, key notes and actions.'))}</p>
  </div>
</section>
${relatedArticles.length ? '<section class="section container"><div class="section-title"><h2>' + escapeHtml(locale === 'zh-CN' ? '最新相关资讯' : 'Latest related articles') + '</h2></div><div class="grid grid-3">' + relatedArticles.map((a) => '<a class="card article-summary-card" href="' + articlePublicPath(a) + '"><span class="badge">' + escapeHtml(a.category || '资讯') + '</span><h3>' + escapeHtml(a.title) + '</h3><p>' + escapeHtml((a.summary || '').slice(0, 90)) + '</p><span class="article-summary-link">' + escapeHtml(locale === 'zh-CN' ? '查看详情' : 'View details') + ' →</span></a>').join('') + '</div></section>' : ''}
`
}



// ---- 城市列表页 /city
export function renderCityList(cities: City[], locale: Locale = 'zh-CN', page?: ManagedPage, pageContact?: PageContactMethods, subprojects: any[] = [], siteProfile?: SiteProfile, images?: ImageStore): string {
  const title = locale === 'zh-CN' ? page?.titleZh : page?.titleEn
  const subtitle = locale === 'zh-CN' ? page?.subtitleZh : page?.subtitleEn
  const content = locale === 'zh-CN' ? page?.contentZh : page?.contentEn
  return `
<section class="hero page-heading-hero">
  <div class="container">
    <h1>${escapeHtml(title || t(locale, 'city.list_title'))}</h1>
    ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
  </div>
</section>

<section class="section container">
  <div class="section-title">
    <div>
      <h2>${escapeHtml(page?.[locale === 'zh-CN' ? 'labelZh' : 'labelEn'] || (locale === 'zh-CN' ? '服务城市' : 'Cities'))}</h2>
      <p class="section-caption">${escapeHtml(locale === 'zh-CN' ? `当前展示 ${cities.length} 个城市` : `${cities.length} cities are available`)}</p>
    </div>
  </div>
  <div class="city-list-grid">
    ${cities.map((item) => `<a class="city-tag city-list-card" href="/city/${item.slug}">
      ${images?.cities?.[item.slug]?.url ? `<img src="${escapeHtml(images.cities[item.slug].url)}" alt="${escapeHtml(images.cities[item.slug].alt || item.name)}" loading="lazy" width="520" height="220" />` : ''}
      <span class="city-list-card-main"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.province || '')}</small></span>
      <span class="city-list-card-link">${escapeHtml(locale === 'zh-CN' ? '查看服务' : 'View services')} →</span>
    </a>`).join('')}
  </div>
</section>

${renderSubprojectTagBar(subprojects, locale)}
${renderManagedSeoSection(content, locale, '城市服务说明', 'City service information')}
`
}


export function renderAboutPage(settings: Record<string, string>, siteName: string, locale: Locale = 'zh-CN', contactMessage = '', page?: ManagedPage, pageContact?: PageContactMethods): string {
  const aboutTitle = locale === 'zh-CN' ? page?.titleZh : page?.titleEn
  const aboutSubtitle = locale === 'zh-CN' ? page?.subtitleZh : page?.subtitleEn
  const aboutContent = locale === 'zh-CN' ? page?.contentZh : page?.contentEn
  const siteProfile = getSiteProfile(settings, siteName)
  const topic = siteProfile.topic || siteProfile.industry || ''
  return `
<section class="hero page-heading-hero">
  <div class="container">
    <h1>${escapeHtml(aboutTitle || t(locale, 'about.title'))}</h1>
    ${aboutSubtitle || settings.site_description ? `<p>${escapeHtml(aboutSubtitle || settings.site_description)}</p>` : ''}
  </div>
</section>



${renderManagedSeoSection(aboutContent, locale, locale === 'zh-CN' ? '关于我们' : 'About our business', locale === 'zh-CN' ? '关于我们' : 'About our business')}
`
}



export function renderContactSection(settings: Record<string, string>, locale: Locale = 'zh-CN', message = '', page?: ManagedPage, _pageContact?: PageContactMethods, showHero = false): string {
  const channels = filterContactChannels(getContactChannelsFromSettings(settings), 'contact')
  const pageTitle = locale === 'zh-CN' ? page?.titleZh : page?.titleEn
  const pageSubtitle = locale === 'zh-CN' ? page?.subtitleZh : page?.subtitleEn
  const pageContent = locale === 'zh-CN' ? page?.contentZh : page?.contentEn
  const channelHtml = channels.map((channel) => {
    const label = channel.label || channel.type
    const value = channel.value
    const href = (() => {
      if (channel.openUrl && /^(https?:|mailto:|tel:)/i.test(channel.openUrl)) return channel.openUrl
      if (channel.type === 'phone') return 'tel:' + encodeURIComponent(value)
      if (channel.type === 'email') return 'mailto:' + encodeURIComponent(value)
      if (channel.type === 'qq') return 'https://wpa.qq.com/msgrd?v=3&uin=' + encodeURIComponent(value) + '&site=qq&menu=yes'
      return ''
    })()
    const valueHtml = href
      ? '<a href="' + escapeHtml(href) + '"' + (href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer nofollow"' : '') + '>' + escapeHtml(value) + '</a>'
      : '<span>' + escapeHtml(value) + '</span>'
    const qr = channel.qrUrl && /^(\/media\/|https?:)/i.test(channel.qrUrl)
      ? '<div class="contact-qr"><p>' + escapeHtml(locale === 'zh-CN' ? (label + '二维码') : (label + ' QR code')) + '</p><div class="contact-qr-frame"><img src="' + escapeHtml(channel.qrUrl) + '" alt="' + escapeHtml(label + ' QR code') + '" width="220" height="220" loading="lazy" decoding="async" /></div></div>'
      : ''
    return '<div class="contact-method"><strong>' + escapeHtml(label) + '</strong>' + valueHtml + qr + '</div>'
  }).join('')
  return `
${showHero ? `<section class="hero page-heading-hero">
  <div class="container">
    <h1>${escapeHtml(pageTitle || t(locale, 'contact.title'))}</h1>
    <p>${escapeHtml(pageSubtitle || t(locale, 'contact.subtitle'))}</p>
  </div>
</section>` : ''}
<section class="section container">
  <div class="contact-panel">
    <div class="contact-info">
      <div class="contact-info-kicker">${escapeHtml(locale === 'zh-CN' ? '联系方式' : 'Contact details')}</div>
      <h2>${escapeHtml(locale === 'zh-CN' ? '直接联系与需求提交' : 'Contact us and send your request')}</h2>
      <p class="contact-info-note">${escapeHtml(locale === 'zh-CN' ? '填写右侧需求表单，或使用已启用的联系渠道。' : 'Use the form or any enabled contact channel.')}</p>
      ${channelHtml}
    </div>
    <form class="contact-form" method="post" action="/contact">
      <div class="contact-form-heading">
        <h2>${escapeHtml(locale === 'zh-CN' ? '留下需求' : 'Send a request')}</h2>
        <p>${escapeHtml(locale === 'zh-CN' ? '我们会根据你填写的信息尽快联系。' : 'We will use your information to follow up.')}</p>
      </div>
      <label>${escapeHtml(t(locale, 'contact.name'))}
        <input name="name" maxlength="100" autocomplete="name" />
      </label>
      <label>${escapeHtml(t(locale, 'contact.phone'))} <span aria-hidden="true">*</span>
        <input name="phone" maxlength="50" autocomplete="tel" inputmode="tel" required />
      </label>
      <label>${escapeHtml(locale === 'zh-CN' ? '邮箱' : 'Email')}<input type="email" name="email" maxlength="254" autocomplete="email" /></label>
      <label>${escapeHtml(t(locale, 'contact.city'))}
        <input name="city" maxlength="100" />
      </label>
      <label>${escapeHtml(t(locale, 'contact.service'))}
        <input name="service" maxlength="100" />
      </label>
      <label>${escapeHtml(t(locale, 'contact.message'))}
        <textarea name="content" maxlength="2000" rows="5"></textarea>
      </label>
      <div style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden" aria-hidden="true">
        <label>website<input name="website" tabindex="-1" autocomplete="off" /></label>
      </div>
      <button class="btn" type="submit">${escapeHtml(t(locale, 'contact.submit'))}</button>
    </form>
  </div>
  ${message ? `<p class="contact-success">${escapeHtml(message)}</p>` : ''}
</section>

${renderManagedSeoSection(pageContent, locale, '服务需求说明', 'Service request information')}
`
}

export function renderPageContactMethods(methods?: PageContactMethods): string {
  if (!methods || (!methods.wechats.length && !methods.qqs.length)) return ''
  const parts = ['<section class="section container"><div class="page-contact card"><strong>本页面联系方式</strong>']
  if (methods.wechats.length) parts.push('<p><strong>微信：</strong>' + methods.wechats.map((v) => '<span>' + escapeHtml(v) + '</span>').join('') + '</p>')
  if (methods.qqs.length) parts.push('<p><strong>QQ：</strong>' + methods.qqs.map((v) => '<a href="https://wpa.qq.com/msgrd?v=3&uin=' + encodeURIComponent(v) + '&site=qq&menu=yes" target="_blank" rel="noopener noreferrer">' + escapeHtml(v) + '</a>').join('、') + '</p>')
  parts.push('</div></section>')
  return parts.join('')
}
// ---- 搜索结果页：分类展示 城市 / 服务 / 资讯 ----
export function renderContactPage(settings: Record<string, string>, locale: Locale = 'zh-CN', message = '', page?: ManagedPage, pageContact?: PageContactMethods): string {
  return renderContactSection(settings, locale, message, page, pageContact, true)
}

export function renderSearchResults(params: { q: string; cities: City[]; services: Service[]; articles: Article[]; locale?: Locale }): string {
  const { q, cities, services, articles, locale = 'zh-CN' } = params
  const empty = !cities.length && !services.length && !articles.length
  return `
<section class="hero page-heading-hero search-results-hero">
  <div class="container">
    <h1>"${escapeHtml(q)}"</h1>
    <p>${escapeHtml(t(locale, 'search.results_for'))}</p>
  </div>
</section>
<section class="section container">
  <h2>"${escapeHtml(q)}" ${escapeHtml(t(locale, 'search.results_for'))}</h2>
  ${empty ? `<p style="color:var(--muted)">${escapeHtml(t(locale, 'search.no_results'))} <a href="/about">${escapeHtml(t(locale, 'search.contact_us'))}</a>。</p>` : ''}

  ${services.length ? `
  <div class="section-title"><h3>${escapeHtml(t(locale, 'search.section_services'))}</h3></div>
  <div class="grid grid-4">
    ${services.map((s) => `<a class="card" href="/service/${s.slug}"><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.summary || '')}</p></a>`).join('')}
  </div>` : ''}

  ${cities.length ? `
  <div class="section-title" style="margin-top:20px"><h3>${escapeHtml(t(locale, 'search.section_cities'))}</h3></div>
  <div class="city-tags">
    ${cities.map((c) => `<a class="city-tag" href="/city/${c.slug}">${escapeHtml(c.name)}</a>`).join('')}
  </div>` : ''}

  ${articles.length ? `
  <div class="section-title" style="margin-top:20px"><h3>${escapeHtml(t(locale, 'search.section_articles'))}</h3></div>
  <div class="grid grid-3">
    ${articles.map((a) => `
      <a class="card" href="${articlePublicPath(a)}">
        <span class="badge">${escapeHtml(a.category || '资讯')}</span>
        <h3>${escapeHtml(a.title)}</h3>
        <p>${escapeHtml((a.summary || '').slice(0, 60))}</p>
      </a>`).join('')}
  </div>` : ''}
</section>
`
}
