// 纯函数、无外部依赖：语言解析规则集中在这里，便于单元测试。
// 产品策略：仅中文前台。类型仍保留 'en' 以兼容历史字段名（titleEn 等），但启用列表与解析结果永远是 zh-CN。
export const SUPPORTED = ['zh-CN', 'en'] as const
export type Locale = typeof SUPPORTED[number]
export const DEFAULT_LOCALE: Locale = 'zh-CN'

function toLocale(code: string): Locale | null {
  const value = code.trim().toLowerCase()
  if (value.startsWith('zh')) return 'zh-CN'
  if (value.startsWith('en')) return 'en'
  return null
}

/** 前台永远只有中文。忽略历史 settings 中的 English。 */
export function enabledLocalesFrom(_items?: Array<{ code: string; enabled?: boolean }> | null): Locale[] {
  return [DEFAULT_LOCALE]
}

/**
 * 语言选择：产品固定中文，忽略 Cookie / Accept-Language。
 */
export function resolveLocale(
  _cookieLang?: string,
  _acceptLanguage?: string,
  _enabled?: readonly Locale[],
): Locale {
  return DEFAULT_LOCALE
}
