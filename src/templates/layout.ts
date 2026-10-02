import { t, type Locale } from '../utils/i18n'
import type { ContactMethods } from '../utils/contactSettings'
import type { ContactChannel } from '../modules/contactChannels/types'
import { filterContactChannels } from '../modules/contactChannels/service'
import type { NavigationItem } from '../modules/navigation/service'
import { DEFAULT_NAVIGATION, getMobileNavigation } from '../modules/navigation/service'
import type { LanguageOption } from '../modules/languageManager'
import { DEFAULT_LANGUAGES } from '../modules/languageManager'

export type LayoutOptions = {
  title: string
  description?: string
  keywords?: string
  siteUrl: string
  siteName: string
  canonical?: string
  robots?: string
  bodyClass?: string
  locale?: Locale
  currentPath?: string
  extraJsonLd?: Record<string, unknown>[]
  contactMethods?: ContactMethods
  /** Canonical contact channel records. When provided, display flags control each surface. */
  contactChannels?: ContactChannel[]
  navLabels?: Partial<Record<'home' | 'services' | 'cities' | 'articles' | 'about' | 'contact', string>>
  /** Full navigation items (order/enabled/mobileOrder). When omitted, falls back to defaults + navLabels. */
  navItems?: NavigationItem[]
  /** Enabled languages for the language switcher. English hidden when not enabled. */
  languages?: LanguageOption[]
  /** Footer text driven by /admin/settings (white-label). */
  footerCopyright?: string
  footerDisclaimer?: string
  footerAiNotice?: string
  footerLinks?: Array<{ label: string; href: string }>
}

export function renderLayout(opts: LayoutOptions, body: string): string {
  const {
    title, description = '', keywords = '', siteUrl, siteName, canonical = siteUrl, robots = 'index,follow', bodyClass = '',
    locale = 'zh-CN', currentPath = '/', extraJsonLd = [],
  } = opts

  const backParam = encodeURIComponent(currentPath)
  const contactMethods = opts.contactMethods
  const contactChannels = opts.contactChannels
  const headerChannels = contactChannels ? filterContactChannels(contactChannels, 'header') : []
  const footerChannels = contactChannels ? filterContactChannels(contactChannels, 'footer') : []
  const headerWechatValues = headerChannels
    .filter((channel) => channel.type === 'wechat')
    .slice(0, 2)
    .map((channel) => channel.value)
  const navLabels = opts.navLabels || {}

  const navItems: NavigationItem[] = (opts.navItems && opts.navItems.length)
    ? opts.navItems
    : DEFAULT_NAVIGATION.map((item) => ({
        ...item,
        label: (navLabels as any)[item.key] || item.label,
      }))

  const desktopNav = [...navItems].sort((a, b) => a.sortOrder - b.sortOrder)
  const mobileNav = getMobileNavigation(navItems)
  const bottomNav = mobileNav

  const languages = (opts.languages && opts.languages.length) ? opts.languages : DEFAULT_LANGUAGES
  const enabledLanguages = languages.filter((l) => l.enabled !== false)
  const showLangSwitcher = enabledLanguages.length > 1

  const navIsActive = (href: string) => currentPath === href || (href !== '/' && currentPath.startsWith(href + '/'))
  const navLink = (href: string, label: string) =>
    `<a href="${href}" class="${navIsActive(href) ? 'active' : ''}"${navIsActive(href) ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`

  const organizationJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': siteUrl + '/#organization',
    name: siteName,
    url: siteUrl,
  }
  const webSiteJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': siteUrl + '/#website',
    name: siteName,
    url: siteUrl,
    publisher: { '@id': siteUrl + '/#organization' },
    inLanguage: locale === 'zh-CN' ? 'zh-CN' : 'en-US',
    potentialAction: {
      '@type': 'SearchAction',
      target: siteUrl + '/search?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  }
  const webPageJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': canonical + '#webpage',
    url: canonical,
    name: title,
    description,
    isPartOf: { '@id': siteUrl + '/#website' },
    about: { '@id': siteUrl + '/#organization' },
    inLanguage: locale === 'zh-CN' ? 'zh-CN' : 'en-US',
  }
  if (contactMethods?.phones.length) {
    organizationJsonLd.contactPoint = contactMethods.phones.map((telephone) => ({
      '@type': 'ContactPoint',
      telephone,
      contactType: 'customer service',
      availableLanguage: locale === 'zh-CN' ? ['Chinese'] : ['English', 'Chinese'],
      url: siteUrl + '/contact',
    }))
  }
  const headerWechat = headerWechatValues.length ? `
    <div class="header-wechat-inline" aria-label="微信联系方式">
      <span class="header-wechat-icon" aria-hidden="true">💬</span>
      <span class="header-wechat-label">微信联系：</span>
      <span class="header-wechat-list">${headerWechatValues.map((value) => `<span>${escapeHtml(value)}</span>`).join('')}</span>
    </div>` : ''

  const footerContactHtml = footerChannels.length ? `
      <div class="footer-contact-channels" aria-label="联系方式">
        ${footerChannels.map((channel) => {
          const href = channel.openUrl || (channel.type === 'phone' ? `tel:${encodeURIComponent(channel.value)}` : channel.type === 'email' ? `mailto:${encodeURIComponent(channel.value)}` : '')
          const label = `${channel.label || channel.type}: ${channel.value}`
          return href
            ? `<a href="${escapeHtml(href)}" rel="nofollow">${escapeHtml(label)}</a>`
            : `<span>${escapeHtml(label)}</span>`
        }).join(' · ')}
      </div>` : ''

  const langSwitcher = showLangSwitcher ? `
    <div class="lang-switch">
      ${enabledLanguages.map((lang, idx) => {
        const code = lang.code === 'en-US' ? 'en' : lang.code
        const active = locale === code || (locale === 'en' && code === 'en')
        const sep = idx > 0 ? '<span>/</span>' : ''
        return `${sep}<a href="/lang/${encodeURIComponent(code)}?back=${backParam}" class="${active ? 'active' : ''}">${escapeHtml(lang.name)}</a>`
      }).join('')}
    </div>` : ''

  const desktopNavHtml = desktopNav.map((item) => navLink(item.path, item.label)).join('\n      ')
  const mobileNavHtml = mobileNav.map((item) => navLink(item.path, item.label)).join('\n      ')
  const bottomIcons: Record<string, string> = {
    home: '🏠', services: '🧾', cities: '📍', articles: '📰', about: 'ℹ️', contact: '💬',
  }
  const bottomNavHtml = bottomNav.map((item) =>
    `<a href="${item.path}" class="${navIsActive(item.path) ? 'active' : ''}"><span>${bottomIcons[item.key] || '•'}</span>${escapeHtml(item.label)}</a>`
  ).join('\n  ')

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8" />
<meta name="robots" content="${escapeHtml(robots)}" />
<link rel="sitemap" type="application/xml" href="${siteUrl}/sitemap.xml" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:locale" content="${locale === 'zh-CN' ? 'zh_CN' : 'en_US'}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<!-- meta keywords 已停用：现代搜索引擎主要依据页面内容、标题、链接和结构化信号判断主题，避免全站关键词堆叠。 -->
<link rel="canonical" href="${canonical}" />
<link rel="describedby" href="${siteUrl}/llms.txt" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${canonical}" />
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#1f6fe0" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
<link rel="stylesheet" href="/styles.css?v=20260929-31" />
<script type="application/ld+json">
${JSON.stringify(organizationJsonLd)}
</script>
${extraJsonLd.map((obj) => `<script type="application/ld+json">\n${JSON.stringify(obj)}\n</script>`).join('\n')}
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main-content">跳到主要内容</a>
<header class="header">
  <div class="header-inner">
    <a class="logo" href="/">◈ ${escapeHtml(siteName)}</a>
    <nav class="nav">
      ${desktopNavHtml}
    </nav>
    <div class="header-tools">
      ${headerWechat}
      ${langSwitcher}
      <button class="mobile-menu-toggle" type="button" aria-label="打开导航" aria-expanded="false" aria-controls="mobileNav">☰</button>
    </div>
  </div>
  <div class="mobile-nav-panel" id="mobileNav" hidden>
    <div class="mobile-nav-head">
      <strong>${escapeHtml(siteName)}</strong>
      <button class="mobile-nav-close" type="button" aria-label="关闭导航">×</button>
    </div>
    <nav class="mobile-nav-list">
      ${mobileNavHtml}
    </nav>
  </div>
</header>
<main id="main-content" class="site-main">
${body}
</main>
<nav class="bottom-nav">
  ${bottomNavHtml}
</nav>
<footer class="footer">
  <div class="container footer-inner">
    <div class="footer-copy">
      <span>${escapeHtml(opts.footerCopyright || (`© ${new Date().getFullYear()} ${siteName}`))}${opts.footerDisclaimer ? ` · ${escapeHtml(opts.footerDisclaimer)}` : ` · ${escapeHtml(t(locale, 'footer.disclaimer'))}`}</span>
      ${opts.footerAiNotice ? `<p class="footer-ai-notice">${escapeHtml(opts.footerAiNotice)}</p>` : ''}
      ${footerContactHtml}
      ${(opts.footerLinks && opts.footerLinks.length) ? `<nav class="footer-links" aria-label="footer">${opts.footerLinks.map((l) => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`).join(' · ')}</nav>` : ''}
    </div>
    <a class="footer-contact-link" href="/contact">💬 ${escapeHtml(desktopNav.find((n) => n.key === 'contact')?.label || t(locale, 'contact.title'))}</a>
  </div>
</footer>
<script>
(() => {
  const toggle = document.querySelector('.mobile-menu-toggle');
  const panel = document.getElementById('mobileNav');
  const close = document.querySelector('.mobile-nav-close');
  if (!toggle || !panel) return;
  const setOpen = (open) => {
    panel.hidden = !open;
    panel.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('mobile-nav-open', open);
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  if (close) close.addEventListener('click', () => setOpen(false));
  panel.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
})();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}
</script>
</body>
</html>`
}

export function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}