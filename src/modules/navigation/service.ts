export type NavigationItem = {
  key: string
  label: string
  path: string
  enabled: boolean
  sortOrder: number
  mobileOrder: number
}

export const DEFAULT_NAVIGATION: NavigationItem[] = [
  { key: 'home', label: '首页', path: '/', enabled: true, sortOrder: 1, mobileOrder: 1 },
  { key: 'services', label: '服务项目', path: '/service', enabled: true, sortOrder: 2, mobileOrder: 2 },
  { key: 'cities', label: '服务城市', path: '/city', enabled: true, sortOrder: 3, mobileOrder: 3 },
  { key: 'articles', label: '新闻资讯', path: '/article', enabled: true, sortOrder: 4, mobileOrder: 4 },
  { key: 'about', label: '关于我们', path: '/about', enabled: true, sortOrder: 5, mobileOrder: 5 },
  { key: 'contact', label: '联系我们', path: '/contact', enabled: true, sortOrder: 6, mobileOrder: 6 },
]

export const NAVIGATION_KEY = 'navigation_json'

export function getNavigation(settings: Record<string, string>, labelOverrides?: Partial<Record<string, string>>): NavigationItem[] {
  let saved: unknown = []
  try {
    saved = JSON.parse(settings[NAVIGATION_KEY] || settings.navigation_items || '[]')
  } catch {
    saved = []
  }

  const map = new Map(
    (Array.isArray(saved) ? saved : []).map((item: any) => [String(item.key || item.path), item]),
  )

  return DEFAULT_NAVIGATION
    .map((item) => {
      const override = map.get(item.key) || map.get(item.path) || {}
      const label =
        (labelOverrides && labelOverrides[item.key]) ||
        String((override as any).label || item.label)
      return {
        ...item,
        label: label.slice(0, 50),
        enabled: (override as any).enabled !== false,
        sortOrder: Number((override as any).sortOrder ?? (override as any).sort ?? item.sortOrder),
        mobileOrder: Number((override as any).mobileOrder ?? (override as any).sortOrder ?? (override as any).sort ?? item.mobileOrder),
      }
    })
    .filter((item) => item.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getMobileNavigation(items: NavigationItem[]): NavigationItem[] {
  return [...items].sort((a, b) => a.mobileOrder - b.mobileOrder)
}

export function serializeNavigation(items: NavigationItem[]): string {
  return JSON.stringify(
    items.map((item) => ({
      key: item.key,
      label: String(item.label || '').slice(0, 50),
      path: item.path,
      enabled: item.enabled !== false,
      sortOrder: Number(item.sortOrder || 0),
      mobileOrder: Number(item.mobileOrder || item.sortOrder || 0),
    })),
  )
}
