// 轻量级会话 token:HMAC-SHA256 签名,避免引入额外依赖包

/** 字符串常量时间比较（与 password.ts 同实现，避免相对路径扩展名在 Node 测试 / tsc 下不一致）。 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmac(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return bytesToBase64Url(sig)
}

export async function signToken(payload: Record<string, unknown>, secret: string, ttlSeconds = 60 * 60 * 24 * 7): Promise<string> {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const json = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(body)))
  const sig = await hmac(secret, json)
  return `${json}.${sig}`
}

export async function verifyToken(token: string | undefined, secret: string): Promise<Record<string, unknown> | null> {
  if (!token) return null
  const [json, sig] = token.split('.')
  if (!json || !sig) return null
  const expected = await hmac(secret, json)
  if (!timingSafeEqual(expected, sig)) return null
  try {
    const padded = json.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((json.length + 3) % 4)
    const payload = JSON.parse(atob(padded))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function getCookie(req: Request, name: string): string | undefined {
  const cookie = req.headers.get('cookie') || ''
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

let cachedJwtSecret: string | undefined

// JWT_SECRET 未手动设置时，首次使用自动在 KV 中生成 256-bit 随机密钥。
export async function getJwtSecret(env: { JWT_SECRET?: string; CACHE_KV?: KVNamespace }): Promise<string> {
  if (env.JWT_SECRET) return env.JWT_SECRET
  if (cachedJwtSecret) return cachedJwtSecret
  if (!env.CACHE_KV) {
    throw new Error('JWT_SECRET 未配置且 CACHE_KV 未绑定，无法安全初始化登录密钥')
  }

  const key = '__cms_jwt_secret'
  const existing = await env.CACHE_KV.get(key)
  if (existing && existing.length >= 32) {
    cachedJwtSecret = existing
    return existing
  }

  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const generated = bytesToBase64Url(bytes)
  await env.CACHE_KV.put(key, generated)
  cachedJwtSecret = generated
  return generated
}
