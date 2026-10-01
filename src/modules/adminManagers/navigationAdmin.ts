import type { Bindings } from '../../types'
import type { NavigationItem } from '../navigationManager'
import { getNavigationItems, saveNavigationItems } from '../navigationManager'

export async function getNavigationAdmin(env: Bindings): Promise<NavigationItem[]> {
  return getNavigationItems(env)
}

export async function updateNavigationAdmin(env: Bindings, value: NavigationItem[] | { items?: NavigationItem[] }) {
  const items = Array.isArray(value) ? value : (value?.items || [])
  return saveNavigationItems(env, items)
}

export const loadNavigationAdmin = getNavigationAdmin
