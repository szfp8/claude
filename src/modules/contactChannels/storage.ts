import type { Bindings } from '../../types'
import type { ContactChannel } from './types'
import { CONTACT_CHANNELS_KEY } from './types'
import { getContactChannelsFromSettings, serializeContactChannels } from './service'

export async function getContactChannels(env: Bindings): Promise<ContactChannel[]> {
  if (!env.DB) return []
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(CONTACT_CHANNELS_KEY).first() as any
    if (row?.value) {
      return getContactChannelsFromSettings({ contact_channels: String(row.value) })
    }
    // Migrate from legacy fields once
    const legacy = (await env.DB.prepare(
      "SELECT key, value FROM settings WHERE key IN ('contact_phone','contact_phones','contact_wechat','contact_wechats','contact_qqs')"
    ).all()).results as any[]
    const map: Record<string, string> = {}
    for (const r of legacy) map[String(r.key)] = String(r.value ?? '')
    return getContactChannelsFromSettings(map)
  } catch {
    return []
  }
}

export async function saveContactChannels(env: Bindings, items: ContactChannel[]) {
  if (!env.DB) throw new Error('D1 is required')
  const value = serializeContactChannels(items || [])
  await env.DB.prepare(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).bind(CONTACT_CHANNELS_KEY, value).run()
}
