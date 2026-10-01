import type { MiddlewareHandler } from 'hono'
import type { Bindings } from '../types'
import { getCookie, getJwtSecret, verifyToken } from '../utils/auth'

export const requireAdmin: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const token = getCookie(c.req.raw, 'admin_session')
  try {
    const secret = await getJwtSecret(c.env)
    const payload = await verifyToken(token, secret)
    if (!payload) return c.redirect('/admin/login')
    await next()
  } catch (e) {
    console.error('admin auth initialization failed', e)
    return c.text('后台登录密钥未初始化，请检查 CACHE_KV 绑定或设置 JWT_SECRET', 503)
  }
}
