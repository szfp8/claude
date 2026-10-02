import type { Bindings } from '../types'
import { getJwtSecret } from './auth'

const PREFIX = 'v1'
const textEncoder = new TextEncoder()

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (const byte of arr) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function getKey(env: Pick<Bindings, 'CACHE_KV' | 'JWT_SECRET'>): Promise<CryptoKey> {
  const secret = await getJwtSecret(env)
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function saveProtectedSecret(
  env: Pick<Bindings, 'DB' | 'CACHE_KV' | 'JWT_SECRET'>,
  name: string,
  value: string,
): Promise<void> {
  const clean = String(value || '').trim()
  if (!clean) {
    await env.DB.prepare('DELETE FROM settings WHERE key=?').bind('secret:' + name).run()
    return
  }
  const key = await getKey(env)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(clean))
  const packed = PREFIX + '.' + b64(iv) + '.' + b64(ciphertext)
  await env.DB.prepare(
    'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).bind('secret:' + name, packed).run()
}

export async function getProtectedSecret(
  env: Pick<Bindings, 'DB' | 'CACHE_KV' | 'JWT_SECRET'>,
  name: string,
): Promise<string> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('secret:' + name).first() as any
  const packed = String(row?.value || '').trim()
  if (!packed) return ''
  const parts = packed.split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX) return ''
  try {
    const key = await getKey(env)
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parts[1]) }, key, unb64(parts[2]))
    return new TextDecoder().decode(plaintext)
  } catch (error) {
    console.error('protected secret decrypt failed', name, error)
    return ''
  }
}

export async function hasProtectedSecret(
  env: Pick<Bindings, 'DB' | 'CACHE_KV' | 'JWT_SECRET'>,
  name: string,
): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 FROM settings WHERE key=? LIMIT 1').bind('secret:' + name).first()
  return !!row
}
