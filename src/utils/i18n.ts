import type { Context } from 'hono'
import { getCookie } from './auth'

import { SUPPORTED, DEFAULT_LOCALE, resolveLocale, type Locale } from './localeResolve'
export { SUPPORTED, DEFAULT_LOCALE, type Locale }

type Dict = Record<string, string>

/** 仅中文。历史 Locale='en' 请求也会回落到中文词条。 */
const ZH: Dict = {
  'nav.home': '首页',
  'nav.services': '服务项目',
  'nav.cities': '服务城市',
  'nav.articles': '新闻资讯',
  'nav.about': '关于我们',
  'nav.contact': '联系我们',
  'nav.search_placeholder': '请输入服务、城市或主题关键词',
  'nav.search_button': '搜索',
  'bottom.home': '首页',
  'bottom.services': '服务',
  'bottom.articles': '资讯',
  'bottom.cities': '城市',
  'home.hero.title': '网站内容平台',
  'home.hero.subtitle': '',
  'home.services.title': '服务项目',
  'home.services.more': '查看全部 →',
  'home.cities.title': '服务城市',
  'home.cities.more': '查看全部 →',
  'home.articles.title': '新闻资讯',
  'home.articles.more': '查看全部 →',
  'common.learn_more': '了解更多 →',
  'common.no_data': '暂无内容',
  'city.hot_services': '服务项目',
  'city.articles': '新闻资讯',
  'service.why_us': '服务说明',
  'service.available_cities': '服务地区',
  'service.list_title': '服务项目',
  'city.list_title': '服务城市',
  'about.title': '关于我们',
  'about.contact': '联系方式',
  'contact.title': '联系我们',
  'contact.subtitle': '提交需求或留下联系方式，我们会尽快回复。',
  'contact.name': '姓名',
  'contact.phone': '联系电话',
  'contact.phone_required': '请填写联系电话',
  'contact.email_invalid': '请填写有效邮箱',
  'contact.city': '所在城市',
  'contact.service': '需要的服务',
  'contact.message': '需求说明',
  'contact.submit': '提交留言',
  'contact.success': '留言已提交，我们会尽快联系您。',
  'contact.qr': '微信扫码咨询',
  'search.results_for': '的搜索结果',
  'search.no_results': '没有找到相关内容，换个关键词试试，或直接',
  'search.contact_us': '联系我们',
  'search.section_services': '相关服务',
  'search.section_cities': '相关城市',
  'search.section_articles': '相关资讯',
  'search.all_cities': '全部城市',
  'footer.disclaimer': '本站内容可能包含人工整理或 AI 辅助生成的信息，发布前应完成人工审核；重要事项请以权威来源和最新公开信息为准。',
  'lang.switch': '语言',
}

export function t(_locale: Locale, key: string): string {
  return ZH[key] ?? key
}

/** 前台传入已启用语言时仍固定解析为中文（见 localeResolve）。 */
export function detectLocale(c: Context, enabled: readonly Locale[] = SUPPORTED): Locale {
  return resolveLocale(getCookie(c.req.raw, 'lang'), c.req.header('accept-language') || '', enabled)
}
