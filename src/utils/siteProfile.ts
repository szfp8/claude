import type { Bindings } from '../types'

export const SITE_PROFILE_KEYS = [
  'site_name', 'site_topic', 'site_industry', 'site_description',
  'primary_services', 'primary_keywords', 'industry_keywords', 'news_categories', 'site_keywords',
] as const

export type SiteProfileKey = (typeof SITE_PROFILE_KEYS)[number]

export type SiteProfile = {
  siteName: string
  topic: string
  industry: string
  description: string
  primaryServices: string[]
  primaryKeywords: string[]
  industryKeywords: string[]
  siteKeywords: string[]
  newsCategories: string[]
}

function splitList(value: unknown, max = 20): string[] {
  return Array.from(new Set(
    String(value || '')
      .split(/[,，;；\n、|]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  )).slice(0, max)
}

/**
 * 白标站点画像。
 * settings 优先；新站默认保持空白行业画像。
 */
export function getSiteProfile(
  settings: Record<string, string> = {},
  envSiteName = '',
): SiteProfile {
  const siteName = String(settings.site_name || envSiteName || '').trim()
  const topic = String(settings.site_topic || '').trim()
  const industry = String(settings.site_industry || '').trim()
  const description = String(settings.site_description || '').trim()
  const primaryServices = splitList(
    settings.primary_services || '',
    12,
  )
  const primaryKeywords = splitList(
    settings.primary_keywords || settings.site_keywords || '',
    20,
  )
  const industryKeywords = splitList(
    settings.industry_keywords || '',
    30,
  )
  const siteKeywords = splitList(
    settings.site_keywords || '',
    20,
  )
  const newsCategories = splitList(
    settings.news_categories || '',
    10,
  )

  return {
    siteName,
    topic,
    industry,
    description,
    primaryServices,
    primaryKeywords,
    industryKeywords,
    siteKeywords,
    newsCategories,
  }
}

export async function loadSiteProfileSettings(
  env: Pick<Bindings, 'DB'>,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  try {
    const placeholders = SITE_PROFILE_KEYS.map(() => '?').join(',')
    const rows = (await env.DB.prepare(
      `SELECT key, value FROM settings WHERE key IN (${placeholders})`,
    ).bind(...SITE_PROFILE_KEYS).all()).results as Array<{ key?: string; value?: unknown }>
    for (const row of rows) {
      const key = String(row.key || '').trim()
      if (key) result[key] = String(row.value ?? '')
    }
  } catch {
    // Keep the public/cron/AI paths usable when settings are temporarily unavailable.
  }
  return result
}

export function getGlobalSeoKeywords(profile: SiteProfile, max = 20): string[] {
  return splitList(
    [
      ...profile.primaryKeywords,
      ...profile.industryKeywords,
      ...profile.siteKeywords,
    ].join(','),
    Math.max(1, Math.min(30, Math.trunc(Number(max) || 20))),
  )
}

export function siteProfileServiceFallback(profile: SiteProfile): string {
  return profile.primaryServices.slice(0, 5).join('、') || profile.topic
}

export function siteProfileKeywordFallback(profile: SiteProfile): string {
  return [...profile.primaryKeywords, ...profile.industryKeywords, ...profile.siteKeywords]
    .slice(0, 5)
    .join(',') || profile.topic
}
