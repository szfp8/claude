import type { Bindings } from '../types'

const KV_TRANSIENT_PREFIX = '__whitelabelcms_cache:'
const KV_PROBE_KEYS = ['__healthz_probe__', '__healthcheck__']

export type R2CleanupResult = {
  deleted: number
  nextCursor: string
  complete: boolean
}

export async function deleteR2PrefixBatch(
  env: Pick<Bindings, 'R2_MEDIA'>,
  prefix: string,
  cursor = '',
  limit = 25,
): Promise<R2CleanupResult> {
  const safePrefix = String(prefix || '').slice(0, 512)
  const safeLimit = Math.max(1, Math.min(25, Math.trunc(limit) || 25))
  const listed = await env.R2_MEDIA.list({
    prefix: safePrefix,
    limit: safeLimit,
    ...(cursor ? { cursor } : {}),
  })
  const keys = listed.objects.map((object) => object.key).filter(Boolean)
  if (keys.length) await env.R2_MEDIA.delete(keys)
  return {
    deleted: keys.length,
    nextCursor: listed.truncated ? String(listed.cursor || '') : '',
    complete: !listed.truncated,
  }
}

export async function clearTransientKvBatch(
  env: Pick<Bindings, 'CACHE_KV'>,
  cursor = '',
  limit = 25,
): Promise<{ deleted: number; nextCursor: string; complete: boolean }> {
  const safeLimit = Math.max(1, Math.min(25, Math.trunc(limit) || 25))
  const listed = await env.CACHE_KV.list({
    prefix: KV_TRANSIENT_PREFIX,
    limit: safeLimit,
    ...(cursor ? { cursor } : {}),
  })
  const names = listed.keys.map((key) => key.name).filter(Boolean)
  for (const name of names) await env.CACHE_KV.delete(name)
  return {
    deleted: names.length,
    nextCursor: listed.list_complete ? '' : String(listed.cursor || ''),
    complete: listed.list_complete,
  }
}

export async function clearKnownKvProbes(env: Pick<Bindings, 'CACHE_KV'>): Promise<number> {
  let deleted = 0
  for (const key of KV_PROBE_KEYS) {
    try {
      await env.CACHE_KV.delete(key)
      deleted++
    } catch (e) {
      console.warn('KV probe cleanup failed', key, e)
    }
  }
  return deleted
}

export async function deleteArticleD1Relations(env: Pick<Bindings, 'DB'>, articleId: number | string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM social_posts WHERE article_id=?').bind(articleId),
    env.DB.prepare('DELETE FROM review_logs WHERE article_id=?').bind(articleId),
    env.DB.prepare('DELETE FROM articles WHERE id=?').bind(articleId),
  ])
}

export async function removePageContact(
  env: Pick<Bindings, 'DB'>,
  pageKeys: string[],
): Promise<boolean> {
  if (!pageKeys.length) return false
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='page_contact_settings_json'").first() as any
  if (!row?.value) return false
  try {
    const store = JSON.parse(String(row.value))
    if (!store || typeof store !== 'object') return false
    let changed = false
    for (const key of pageKeys) {
      if (Object.prototype.hasOwnProperty.call(store, key)) {
        delete store[key]
        changed = true
      }
    }
    if (!changed) return false
    await env.DB.prepare(
      "UPDATE settings SET value=? WHERE key='page_contact_settings_json'",
    ).bind(JSON.stringify(store)).run()
    return true
  } catch (e) {
    console.warn('page contact cleanup skipped because JSON is invalid', e)
    return false
  }
}


const PRODUCTION_D1_TABLES = [
  'social_posts',
  'review_logs',
  'collection_logs',
  'articles',
  'keywords',
  'news_sources',
  'submit_logs',
  'cities',
  'services',
  'media_assets',
] as const

export type ProductionD1BatchResult = {
  deleted: number
  complete: boolean
  nextTable: string
}

export async function deleteProductionD1Batch(
  env: Pick<Bindings, 'DB'>,
  table: string,
  limit = 25,
): Promise<ProductionD1BatchResult> {
  const safeLimit = Math.max(1, Math.min(25, Math.trunc(limit) || 25))
  const index = PRODUCTION_D1_TABLES.indexOf(table as any)
  if (index < 0) throw new Error('不允许清理的 D1 表')
  const currentTable = PRODUCTION_D1_TABLES[index]
  const result = await env.DB
    .prepare(`DELETE FROM ${currentTable} WHERE rowid IN (SELECT rowid FROM ${currentTable} LIMIT ?)`)
    .bind(safeLimit)
    .run()
  const deleted = Number((result as any)?.meta?.changes || 0)
  if (deleted > 0) {
    return { deleted, complete: false, nextTable: currentTable }
  }
  const nextIndex = index + 1
  if (nextIndex >= PRODUCTION_D1_TABLES.length) {
    return { deleted: 0, complete: false, nextTable: '__production_settings__' }
  }
  return { deleted: 0, complete: false, nextTable: PRODUCTION_D1_TABLES[nextIndex] }
}

export async function deleteProductionSettingsBatch(
  env: Pick<Bindings, 'DB'>,
  kind: 'ai_page' | 'generated_meta',
  limit = 25,
): Promise<ProductionD1BatchResult> {
  const safeLimit = Math.max(1, Math.min(25, Math.trunc(limit) || 25))
  const sql = kind === 'ai_page'
    ? "DELETE FROM settings WHERE key IN (SELECT key FROM settings WHERE key LIKE 'ai_page:%' LIMIT ?)"
    : "DELETE FROM settings WHERE key IN (SELECT key FROM settings WHERE key IN ('ai_page_content_json','image_settings_json','page_contact_settings_json','service_external_links','contact_qr_url') LIMIT ?)"
  const result = await env.DB.prepare(sql).bind(safeLimit).run()
  const deleted = Number((result as any)?.meta?.changes || 0)
  return {
    deleted,
    complete: deleted === 0,
    nextTable: kind === 'ai_page' ? '__generated_meta__' : '__done__',
  }
}

export async function removeImageStoreGroup(
  env: Pick<Bindings, 'DB'>,
  group: 'cities' | 'services',
): Promise<void> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='image_settings_json'").first() as any
  if (!row?.value) return
  try {
    const store = JSON.parse(String(row.value))
    if (!store || typeof store !== 'object') return
    store[group] = {}
    await env.DB.prepare(
      "UPDATE settings SET value=? WHERE key='image_settings_json'",
    ).bind(JSON.stringify(store)).run()
  } catch (e) {
    console.warn('image store cleanup skipped because JSON is invalid', e)
  }
}
