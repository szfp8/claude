import type { MiddlewareHandler } from 'hono'
import type { Bindings } from '../types'
import { getCookie, getJwtSecret, verifyToken } from '../utils/auth'

async function passwordFingerprint(passwordHash: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passwordHash))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const requireAdmin: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const token = getCookie(c.req.raw, 'admin_session')
  try {
    const secret = await getJwtSecret(c.env)
    const payload = await verifyToken(token, secret)
    const uid = Number(payload?.uid || 0)
    if (!payload || !uid) return c.redirect('/admin/login')

    // 会话不仅验证 JWT 签名，还必须对应当前仍存在的管理员账号。
    // pwd 指纹绑定当前密码：修改密码/恢复账号后，旧 JWT 会立即失效，而无需新增 D1 migration。
    const user = await c.env.DB.prepare(
      'SELECT id, email, role, password_hash FROM admin_users WHERE id=?'
    ).bind(uid).first() as any
    if (!user || user.role !== 'admin') return c.redirect('/admin/login')
    if (String(payload.email || '').trim().toLowerCase() !== String(user.email || '').trim().toLowerCase()) {
      return c.redirect('/admin/login')
    }
    const currentFingerprint = await passwordFingerprint(String(user.password_hash || ''))
    if (String(payload.pwd || '') !== currentFingerprint) return c.redirect('/admin/login')

    await next()
  } catch (e) {
    console.error('admin auth initialization failed', e)
    return c.text('后台登录密钥未初始化，请检查 CACHE_KV 绑定或设置 JWT_SECRET', 503)
  }
}
