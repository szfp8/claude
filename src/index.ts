import { Hono } from 'hono'
import type { Bindings, Variables } from './types'
import { publicRoutes } from './routes/public'
import { apiRoutes } from './routes/api'
import { adminRoutes } from './routes/admin'
import { adminModuleRoutes } from './routes/adminModules'
import { seoRoutes } from './routes/seo'
import { securityHeaders, rateLimit } from './middleware/security'
import { runNewsCollection } from './cron/newsCollector'
import { detectLocale } from './utils/i18n'
import { getEnabledLocales } from './modules/languageManager/storage'
import { getAiSettings, runConfiguredAi } from './utils/aiSettings'
import { getAiResponseText } from './utils/aiJson'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.onError((err, c) => {
  console.error('Unhandled Worker error', err)
  c.header('Cache-Control', 'no-store')
  const msg = String((err as any)?.message || err || '').slice(0, 200)
  if (c.req.path.startsWith('/api/')) {
    return c.json({ ok: false, error: '服务器暂时不可用，请稍后重试', detail: msg || undefined }, 500)
  }
  if (c.req.path === '/admin/setup' || c.req.path === '/admin/login') {
    return c.text(
      '初始化/登录暂时失败。请确认已部署最新代码；Free 计划请使用 10–64 位密码并重试。' +
        (msg ? (' 技术信息：' + msg) : '') +
        ' 也可在 Worker Secrets 中设置 JWT_SECRET 后重试。详见 docs/CF-SETUP-TROUBLESHOOTING.md',
      500,
    )
  }
  return c.text('服务器暂时不可用，请稍后重试。', 500)
})

app.use('*', securityHeaders)
app.use('*', async (c, next) => {
  const path = c.req.path
  if (path.startsWith('/admin') || path.startsWith('/api') || path === '/healthz') {
    c.set('locale', detectLocale(c))
    c.set('multilingual', false)
  } else {
    const enabled = await getEnabledLocales(c.env)
    c.set('locale', detectLocale(c, enabled))
    c.set('multilingual', enabled.length > 1)
  }
  await next()
})
app.use('/admin/login', rateLimit(10, 60))
app.use('/admin/setup', rateLimit(10, 60))

app.get('/healthz', async (c) => {
  const env = c.env
  let dbOk = false
  let dbSchemaOk = false
  let missingTables: string[] = []
  if (env.DB) {
    dbOk = true
    try {
      await env.DB.prepare('SELECT 1').first()
      const required = [
        'cities', 'services', 'keywords', 'articles', 'news_sources',
        'messages', 'admin_users', 'settings', 'submit_logs',
        'review_logs', 'collection_logs', 'daily_stats', 'social_posts', 'media_assets', 'subprojects', 'subproject_items', 'message_replies',
      ]
      const placeholders = required.map(() => '?').join(',')
      const rows = (await env.DB.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`
      ).bind(...required).all()).results as any[]
      const present = new Set(rows.map((row) => row.name))
      missingTables = required.filter((name) => !present.has(name))
      dbSchemaOk = missingTables.length === 0
    } catch (e) {
      console.error('healthz D1 check failed', e)
    }
  }
  const probe = c.req.query('probe') === '1'
  const probeAi = c.req.query('probe') === 'ai'
  const deep: Record<string, any> = {}
  if (probe || probeAi) {
    try { await env.CACHE_KV.put('__healthz_probe__', 'ok', { expirationTtl: 60 }); deep.kv = (await env.CACHE_KV.get('__healthz_probe__')) === 'ok'; await env.CACHE_KV.delete('__healthz_probe__') } catch (e: any) { deep.kv = false; deep.kv_error = String(e?.message || e) }
    try { const key = '__healthz_probe__/' + crypto.randomUUID(); await env.R2_MEDIA.put(key, 'ok', { httpMetadata: { contentType: 'text/plain' } }); const object = await env.R2_MEDIA.head(key); await env.R2_MEDIA.delete(key); deep.r2 = !!object } catch (e: any) { deep.r2 = false; deep.r2_error = String(e?.message || e) }
    if (probeAi) {
      const aiSettings = await getAiSettings(env)
      if (!aiSettings.enabled) {
        deep.ai = true
        deep.ai_status = 'disabled'
        deep.ai_model = aiSettings.model
      } else {
        try {
          const res: any = await runConfiguredAi(env, { messages: [{ role: 'user', content: 'Reply with exactly OK' }] }, aiSettings)
          const response = getAiResponseText(res).trim()
          if (!response) throw new Error('Workers AI 返回了空响应')
          deep.ai = response.length > 0
          deep.ai_model = aiSettings.model
          deep.ai_response = response.slice(0, 40)
        } catch (e: any) {
          deep.ai = false
          deep.ai_model = aiSettings.model
          deep.ai_error = String(e?.message || e)
        }
      }
    } else {
      deep.ai = true
      deep.ai_status = 'skipped'
      deep.ai_hint = 'use ?probe=ai to test Workers AI (consumes quota)'
    }
  }
  return c.json({
    ok: dbOk && dbSchemaOk && (!(probe || probeAi) || (deep.kv === true && deep.r2 === true && deep.ai === true)),
    bindings: {
      DB: dbOk,
      CACHE_KV: !!env.CACHE_KV,
      R2_MEDIA: !!env.R2_MEDIA,
      AI: !!env.AI,
      ASSETS: !!env.ASSETS,
    },
    d1_schema: dbSchemaOk,
    missing_tables: missingTables,
    probe: (probe || probeAi) ? deep : undefined,
    worker: env.SITE_NAME || 'white-label-cms',
  })
})

app.get('/wechat-qr', async (c) => {
  const bucket = c.env.R2_MEDIA
  if (!bucket) return c.notFound()
  try {
    const row = await c.env.DB.prepare("SELECT value FROM settings WHERE key='contact_qr_url'").first() as any
    const configured = String(row?.value || '').trim()
    if (!configured.startsWith('/media/')) return c.notFound()
    const key = 'media/' + configured.slice('/media/'.length)
    if (key.includes('..')) return c.notFound()
    const object = await bucket.get(key)
    if (!object || object.size <= 0) return c.notFound()
    const ext = key.split('.').pop()?.toLowerCase() || ''
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    }
    const bytes = await object.arrayBuffer()
    if (!bytes.byteLength) return c.notFound()
    const headers = new Headers()
    headers.set('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    headers.set('Content-Disposition', 'inline')
    headers.set('Content-Length', String(bytes.byteLength))
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate')
    headers.set('Cloudflare-CDN-Cache-Control', 'no-store')
    return new Response(bytes, { headers })
  } catch (e) {
    console.error('wechat QR read failed', e)
    return c.notFound()
  }
})

app.route('/', publicRoutes)

app.get('/media/*', async (c) => {
  const bucket = c.env.R2_MEDIA
  if (!bucket) return c.text('R2 媒体存储未绑定', 503)
  let key = ''
  try {
    key = decodeURIComponent(new URL(c.req.url).pathname.slice('/media/'.length))
  } catch {
    return c.notFound()
  }
  if (!key || key.includes('..')) return c.notFound()
  try {
    const object = await bucket.get('media/' + key)
    if (!object) return c.notFound()
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    if (!headers.get('Content-Type')) {
      const ext = key.split('.').pop()?.toLowerCase() || ''
      const fallbackTypes: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
      }
      headers.set('Content-Type', fallbackTypes[ext] || 'application/octet-stream')
    }
    headers.set('Content-Disposition', 'inline')
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('ETag', object.httpEtag)
    headers.set('Content-Length', String(object.size))
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    headers.set('Cloudflare-CDN-Cache-Control', 'public, max-age=31536000, immutable')
    headers.set('Cache-Tag', 'whitelabel-cms-r2-' + ('media/' + key).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 900))
    return new Response(object.body, { headers })
  } catch (e) {
    console.error('R2 media read failed', e)
    return c.text('媒体读取失败，请稍后重试', 503)
  }
})

app.route('/api', apiRoutes)

function clearAdminSessionCookie(c: any) {
  c.header('Set-Cookie', 'admin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')
  return c.redirect('/admin/login')
}
// Prefer app-level logout so POST works even if nested route only had GET.
app.get('/admin/logout', clearAdminSessionCookie)
app.post('/admin/logout', clearAdminSessionCookie)

// Progressive enhancement: convert GET logout anchors to POST on click (admin HTML only).
// Always re-attach Response after res.text() so login/setup pages are not emptied.
app.use('/admin/*', async (c, next) => {
  await next()
  const res = c.res
  if (!res) return
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('text/html')) return
  let html = ''
  try {
    html = await res.text()
  } catch {
    return
  }
  let out = html
  if (html.includes('href="/admin/logout"') && !html.includes('data-admin-logout-post-enhance')) {
    const script =
      '<script data-admin-logout-post-enhance>(function(){document.querySelectorAll(\'a[href="/admin/logout"]\').forEach(function(a){a.addEventListener(\'click\',function(e){e.preventDefault();var f=document.createElement(\'form\');f.method=\'post\';f.action=\'/admin/logout\';f.style.display=\'none\';document.body.appendChild(f);f.submit();});});})();</script>'
    out = html.includes('</body>') ? html.replace('</body>', script + '</body>') : html + script
  }
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  c.res = new Response(out, { status: res.status, statusText: res.statusText, headers })
})

app.route('/admin/modules', adminModuleRoutes)
app.route('/admin', adminRoutes)
app.route('/', seoRoutes)

app.get('*', (c) => c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound())

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    try {
      const rows = (await env.DB.prepare(
        "SELECT key, value FROM settings WHERE key IN ('news_collection_enabled','news_collection_time')"
      ).all()).results as any[]
      const settings: Record<string, string> = {}
      for (const row of rows) settings[String(row.key)] = String(row.value ?? '')
      if (settings.news_collection_enabled === '0') return
      const configuredTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.news_collection_time || '')
        ? settings.news_collection_time
        : '08:00'
      // Cloudflare Cron Triggers run on a 5-minute cadence here. The configured
      // business time is Beijing time, so accept the first cron tick within the
      // five-minute window instead of requiring an impossible exact minute.
      const now = new Date()
      const beijingTotalMinutes = (((now.getUTCHours() + 8) % 24) * 60) + now.getUTCMinutes()
      const [targetHour, targetMinute] = configuredTime.split(':').map(Number)
      const targetTotalMinutes = targetHour * 60 + targetMinute
      const minutesSinceTarget = (beijingTotalMinutes - targetTotalMinutes + 1440) % 1440
      if (minutesSinceTarget >= 5) return

      // Avoid a duplicate run if Cloudflare retries the same scheduled invocation
      // inside the same five-minute window. KV is best-effort locking; the D1
      // pipeline remains idempotent through source_url deduplication.
      const lockKey = 'news_collection:scheduled:' + targetTotalMinutes + ':' + Math.floor(beijingTotalMinutes / 5)
      try {
        const existingLock = await env.CACHE_KV.get(lockKey)
        if (existingLock) return
        await env.CACHE_KV.put(lockKey, new Date().toISOString(), { expirationTtl: 300 })
      } catch (e) {
        console.warn('news collection schedule lock unavailable; continuing without lock', e)
      }

      ctx.waitUntil(runNewsCollection(env, undefined, ctx).catch((e) => console.error('scheduled news collection failed', e)))
    } catch (e) {
      console.error('scheduled news collection settings check failed', e)
    }
  },
}
