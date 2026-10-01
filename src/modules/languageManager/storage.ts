import type { Bindings } from '../../types'
import { DEFAULT_LANGUAGES, LANGUAGES_KEY, type LanguageOption } from './types'
import { enabledLocalesFrom, type Locale } from '../../utils/localeResolve'

function normalize(_items: any[]): LanguageOption[] {
  // 产品锁定仅中文：忽略任何 English / 其它语言配置
  return DEFAULT_LANGUAGES.map((x) => ({ ...x }))
}

export async function getLanguages(env: Bindings): Promise<LanguageOption[]> {
  if (!env.DB) return DEFAULT_LANGUAGES
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(LANGUAGES_KEY).first() as any
    if (!row?.value) return DEFAULT_LANGUAGES
    const items = JSON.parse(String(row.value))
    return Array.isArray(items) ? normalize(items) : DEFAULT_LANGUAGES
  } catch {
    return DEFAULT_LANGUAGES
  }
}

export function getLanguagesFromSettings(settings: Record<string, string>): LanguageOption[] {
  try {
    const items = settings.languages ? JSON.parse(settings.languages) : null
    return Array.isArray(items) ? normalize(items) : DEFAULT_LANGUAGES
  } catch {
    return DEFAULT_LANGUAGES
  }
}

export async function saveLanguages(env: Bindings, items: LanguageOption[]) {
  if (!env.DB) throw new Error('D1 is required')
  const normalized = normalize(items || DEFAULT_LANGUAGES)
  await env.DB.prepare(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).bind(LANGUAGES_KEY, JSON.stringify(normalized)).run()
  invalidateEnabledLocalesCache()
}

// ---------- 前台已启用语言（isolate 内缓存 60 秒，避免每个请求都多一次 D1 查询） ----------
const ENABLED_LOCALES_TTL_MS = 60_000
let enabledLocalesCache: { at: number; value: Locale[] } | null = null

/**
 * 返回前台已启用的语言。产品固定仅中文；失败时同样返回 zh-CN。
 */
export async function getEnabledLocales(env: Bindings): Promise<Locale[]> {
  const now = Date.now()
  if (enabledLocalesCache && now - enabledLocalesCache.at < ENABLED_LOCALES_TTL_MS) return enabledLocalesCache.value
  if (!env.DB) return enabledLocalesFrom(null)
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(LANGUAGES_KEY).first() as any
    let items: LanguageOption[] = DEFAULT_LANGUAGES
    if (row?.value) {
      const parsed = JSON.parse(String(row.value))
      if (Array.isArray(parsed)) items = normalize(parsed)
    }
    const value = enabledLocalesFrom(items)
    enabledLocalesCache = { at: now, value }
    return value
  } catch (e) {
    console.error('load enabled locales failed; assuming all locales', e)
    return enabledLocalesFrom(null)
  }
}

/** 后台保存语言设置后立即让本 isolate 的缓存失效（其它 isolate 最多 60 秒后生效）。 */
export function invalidateEnabledLocalesCache() {
  enabledLocalesCache = null
}
