export type AiContentEntry = { title: string; summary: string; content: string; weight?: number; updatedAt?: string }

function hasAiJsonArtifact(content: unknown): boolean {
  const text = String(content || '').replace(/<[^>]+>/g, ' ').trim()
  return /^\s*[{[]/.test(text) && /["']?(title|summary|content)["']?/i.test(text)
}
export type AiContentStore = { cities: Record<string, AiContentEntry>; services: Record<string, AiContentEntry>; landing: Record<string, AiContentEntry> }

export function getAiContentStore(settings: Record<string, string>): AiContentStore {
  const base: AiContentStore = { cities: {}, services: {}, landing: {} }
  try {
    const raw = settings.ai_page_content_json ? JSON.parse(settings.ai_page_content_json) : {}
    return { cities: raw?.cities || {}, services: raw?.services || {}, landing: raw?.landing || {} }
  } catch {
    return base
  }
}

export function saveAiContentStore(store: AiContentStore): string {
  return JSON.stringify(store)
}

export type AiContentGroup = keyof AiContentStore

export function aiContentSettingKey(group: AiContentGroup, key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180)
  return 'ai_page:' + group + ':' + safe
}

export function getAiContentEntry(settings: Record<string, string>, group: AiContentGroup, key: string): AiContentEntry | undefined {
  const direct = settings[aiContentSettingKey(group, key)]
  if (direct) {
    try {
      const parsed = JSON.parse(direct)
      if (parsed && typeof parsed.content === 'string' && !hasAiJsonArtifact(parsed.content)) return parsed
      return undefined
    } catch {}
  }
  return getAiContentStore(settings)[group][key]
}

export function setAiContentEntry(settings: Record<string, string>, group: AiContentGroup, key: string, entry: AiContentEntry): Record<string, string> {
  return { ...settings, [aiContentSettingKey(group, key)]: JSON.stringify({ ...entry, updatedAt: new Date().toISOString() }) }
}

export function removeAiContentEntry(settings: Record<string, string>, group: AiContentGroup, key: string): Record<string, string> {
  const next = { ...settings }
  delete next[aiContentSettingKey(group, key)]
  return next
}

export async function getAiContentEntryDb(env: { DB: D1Database }, settings: Record<string, string>, group: AiContentGroup, key: string): Promise<AiContentEntry | undefined> {
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(aiContentSettingKey(group, key)).first() as any
    if (row?.value) {
      const parsed = JSON.parse(String(row.value))
      if (parsed && typeof parsed.content === 'string' && !hasAiJsonArtifact(parsed.content)) return parsed
    }
  } catch (e) {
    console.error('AI content lookup failed', e)
  }
  return getAiContentEntry(settings, group, key)
}
