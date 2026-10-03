import type { Bindings } from '../types'

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

