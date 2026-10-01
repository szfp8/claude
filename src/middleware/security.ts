import type { MiddlewareHandler } from 'hono'
import type { Bindings, Variables } from '../types'

export function rateLimit(limit = 10, windowSeconds = 60, scope = 'default'): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
  return async (c, next) => {
    const kv = c.env.CACHE_KV
    if (!kv) return next()

    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
    const safeScope = String(scope || 'default').replace(/[^a-z0-9_-]/gi, '_')
    const key = `rl:${safeScope}:${ip}:${Math.floor(Date.now() / 1000 / windowSeconds)}`
    try {
      const current = parseInt((await kv.get(key)) || '0', 10)
      if (current >= limit) return c.text('请求过于频繁，请稍后再试', 429)
      await kv.put(key, String(current + 1), { expirationTtl: windowSeconds + 5 })
    } catch (e) {
      console.error('KV rate-limit failed; bypassing limiter', { scope: safeScope, error: e })
    }
    await next()
  }
}

export const LOGIN_MAX_FAILURES = 5
export const LOGIN_LOCK_SECONDS = 15 * 60

type KvLike = {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

async function loginFailureKey(email: string, ip: string): Promise<string> {
  const data = new TextEncoder().encode(email.trim().toLowerCase() + '|' + ip)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return 'lf:' + hex
}

export async function isLoginLocked(kv: KvLike | undefined, email: string, ip: string): Promise<boolean> {
  if (!kv) return false
  try {
    const count = parseInt((await kv.get(await loginFailureKey(email, ip))) || '0', 10)
    return count >= LOGIN_MAX_FAILURES
  } catch (e) {
    console.error('login lock check failed; not locking', e)
    return false
  }
}

export async function recordLoginFailure(kv: KvLike | undefined, email: string, ip: string): Promise<number> {
  if (!kv) return 0
  try {
    const key = await loginFailureKey(email, ip)
    const next = parseInt((await kv.get(key)) || '0', 10) + 1
    await kv.put(key, String(next), { expirationTtl: LOGIN_LOCK_SECONDS })
    return next
  } catch (e) {
    console.error('login failure record failed', e)
    return 0
  }
}

export async function clearLoginFailures(kv: KvLike | undefined, email: string, ip: string): Promise<void> {
  if (!kv) return
  try {
    await kv.delete(await loginFailureKey(email, ip))
  } catch (e) {
    console.error('login failure clear failed', e)
  }
}

export function isEdgeCacheableHtml(multilingual: boolean): boolean {
  return !multilingual
}

export function isSafeAdminMutationRequest(request: Request): boolean {
  const url = new URL(request.url)
  const method = request.method.toUpperCase()
  const needsOriginCheck = url.pathname.startsWith('/admin') || url.pathname === '/contact'
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !needsOriginCheck) return true

  const fetchSite = request.headers.get('sec-fetch-site') || ''
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false

  const origin = request.headers.get('origin') || ''
  if (origin) {
    try {
      if (new URL(origin).origin !== url.origin) return false
    } catch {
      return false
    }
  }

  return true
}

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  if (!isSafeAdminMutationRequest(c.req.raw)) return c.text('请求来源无效', 403)
  await next()

  const path = c.req.path
  const isPrivate = path.startsWith('/admin') || path.startsWith('/api') || path === '/healthz'
  if (isPrivate) {
    c.res.headers.set('Cache-Control', 'no-store, max-age=0')
    c.res.headers.set('Cloudflare-CDN-Cache-Control', 'no-store')
  } else if (
    c.req.method === 'GET' &&
    c.res.status === 200 &&
    c.res.headers.get('content-type')?.includes('text/html')
  ) {
    if (!isEdgeCacheableHtml((c as any).get('multilingual') === true)) {
      c.res.headers.set('Cache-Control', 'private, no-store')
      c.res.headers.set('Cloudflare-CDN-Cache-Control', 'no-store')
    } else {
      c.res.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300')
      c.res.headers.set('Cloudflare-CDN-Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
      c.res.headers.set('Cache-Tag', 'whitelabel-cms-public')
      c.res.headers.set('Vary', 'Cookie')
    }
  }

  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('X-Frame-Options', 'SAMEORIGIN')
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.res.headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()')
  c.res.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
}
