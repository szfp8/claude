import type { Bindings } from '../../types'
import { DEFAULT_NAVIGATION, NAVIGATION_KEY, serializeNavigation, type NavigationItem } from '../navigation/service'

export async function getNavigationItems(env: Bindings): Promise<NavigationItem[]> {
  if (!env.DB) return DEFAULT_NAVIGATION
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(NAVIGATION_KEY).first() as any
    if (!row?.value) return DEFAULT_NAVIGATION
    const items = JSON.parse(String(row.value))
    if (!Array.isArray(items) || !items.length) return DEFAULT_NAVIGATION
    // Merge with defaults so new keys appear after upgrades
    const map = new Map(items.map((item: any) => [String(item.key), item]))
    return DEFAULT_NAVIGATION.map((item) => ({
      ...item,
      ...(map.get(item.key) || {}),
      enabled: map.get(item.key)?.enabled !== false,
    }))
  } catch {
    return DEFAULT_NAVIGATION
  }
}

export async function saveNavigationItems(env: Bindings, items: NavigationItem[]) {
  if (!env.DB) throw new Error('D1 is required')
  await env.DB.prepare(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).bind(NAVIGATION_KEY, serializeNavigation(items || DEFAULT_NAVIGATION)).run()
}

// Aliases used by admin managers
export const getNavigation = getNavigationItems
export const saveNavigation = saveNavigationItems
