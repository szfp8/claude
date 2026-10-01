import { Hono } from 'hono'
import type { Bindings } from '../../types'
import { getLanguageAdmin, updateLanguageAdmin } from '../../modules/adminManagers/languageAdmin'

export const languageAdminRoutes = new Hono<{ Bindings: Bindings }>()

languageAdminRoutes.get('/', async (c) => {
  const data = await getLanguageAdmin(c.env)
  return c.json({ ok: true, data })
})

languageAdminRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  await updateLanguageAdmin(c.env, body)
  return c.json({ ok: true })
})
