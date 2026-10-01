import { Hono } from 'hono'
import type { Bindings } from '../types'

export const apiRoutes = new Hono<{ Bindings: Bindings }>()

// 公开留言只走 /contact（蜜罐 + IP 限流 + 邮箱校验）。这里不再提供未鉴权写入接口。
apiRoutes.post('/messages', (c) => c.json({ ok: false, error: '请使用页面表单提交留言' }, 404))
