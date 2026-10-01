import type { Bindings } from '../types'
import type { Locale } from './i18n'
import { getPageNavigationLabels } from './pageSettings'
import { getContactMethods, type ContactMethods } from './contactSettings'
import { getNavigation } from '../modules/navigation/service'
import { getLanguagesFromSettings } from '../modules/languageManager'
import { channelsToContactMethods, getActiveContactChannels } from '../modules/contactChannels'
import { getFooterSettings } from './footerSettings'

/**
 * Build shared layout options (nav + languages + contact + footer) from settings map.
 * Prefer generic contact_channels when present; fall back to legacy fields.
 * contactChannels is passed separately so each frontend surface can honor display flags.
 */
export function buildLayoutChrome(
  settings: Record<string, string>,
  locale: Locale,
  contactOverride?: ContactMethods,
) {
  const navLabels = getPageNavigationLabels(settings, locale)
  const navItems = getNavigation(settings, navLabels)
  const languages = getLanguagesFromSettings(settings)
  const contactChannels = getActiveContactChannels(settings)
  const base = channelsToContactMethods(contactChannels)
  const contactMethods: ContactMethods = contactOverride
    ? {
        phones: contactOverride.phones?.length ? contactOverride.phones : base.phones,
        wechats: contactOverride.wechats?.length ? contactOverride.wechats : base.wechats,
        qqs: contactOverride.qqs?.length ? contactOverride.qqs : base.qqs,
      }
    : base
  const siteName = String(settings.site_name || '').trim()
  const footer = getFooterSettings(settings, siteName, locale)
  return {
    navLabels,
    navItems,
    languages,
    contactMethods,
    contactChannels,
    footerCopyright: footer.copyright,
    footerDisclaimer: footer.disclaimer,
    footerAiNotice: footer.aiNotice,
    footerLinks: footer.links,
  }
}

export async function loadSettingsMap(env: Bindings): Promise<Record<string, string>> {
  if (!env.DB) return {}
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM settings WHERE key NOT LIKE 'ai_page:%'").all()
    const map: Record<string, string> = {}
    for (const r of results as any[]) map[r.key] = r.value
    return map
  } catch {
    return {}
  }
}
