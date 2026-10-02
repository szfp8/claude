import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAdmin } from '../middleware/authGuard'
import { getCookie, getJwtSecret, signToken, verifyToken } from '../utils/auth'
import { hashPassword, verifyPassword, validatePasswordStrength, getPbkdf2Iterations, timingSafeEqual, DUMMY_PASSWORD_HASH } from '../utils/password'
import { isLoginLocked, recordLoginFailure, clearLoginFailures, LOGIN_LOCK_SECONDS } from '../middleware/security'
import { mediaCacheTag, purgeCacheAll, purgeCacheEverything, purgeCacheTags } from '../middleware/cache'
import { getAllPublishedUrls, submitAllEngines, getIndexNowKey, notifyPublishedUrl, notifyDeletedUrl } from '../utils/seo'
import { calcOpportunityScore, estimateDifficulty, buildLandingSlug, MIN_INDEXABLE_OPPORTUNITY_SCORE } from '../utils/keywordScore'
import { generateInterpretationCard } from '../utils/interpretationCard'
import { buildWechatHtml } from '../utils/wechatFormat'
import { PLATFORMS, PLATFORM_LIST, type PlatformKey } from '../utils/socialPlatforms'
import { generateSocialContent, buildPlainCopyText, buildRichCopyHtml } from '../utils/socialFormat'
import { syncPublishedArticleToDomesticPlatforms } from '../utils/socialSync'
import { resolveSiteUrl } from '../utils/siteUrl'
import { getPageNavigationLabels, getPageSettings, serializePageSettings, isManagedPageKey, isHttpUrl } from '../utils/pageSettings'
import { autoCitySeo, autoServiceSeo, autoArticleSeo, buildArticleSeoKeywords, normalizeSeoKeywords, normalizeKeywordCandidates, alignSeoKeywordsToContent } from '../utils/autoSeo'
import { getContactMethods } from '../utils/contactSettings'
import { getPageContact, savePageContact, PAGE_CONTACTS_KEY } from '../utils/pageContacts'
import { sendCustomerReplyEmail } from '../utils/email'
import { getServiceExternalLinks, serializeServiceExternalLinks } from '../utils/serviceSettings'
import { getAiContentStore, saveAiContentStore, getAiContentEntry, getAiContentEntryDb, aiContentSettingKey } from '../utils/aiContentStore'
import { generateAiPageContent } from '../utils/aiPageContent'
import { getAiSettings, saveAiSettings, normalizeAiSettings, runConfiguredAi } from '../utils/aiSettings'
import { getAiResponseText, parseAiJson } from '../utils/aiJson'
import { getAiPromptSettings, saveAiPromptSettings, AI_PROMPT_SPECS, validateAiPromptVariables, composeAiPromptWithSystemContacts } from '../utils/aiPrompts'
import { statusAfterAiDraft } from '../services/newsPipeline'
import { auditSeoPage, summarizeSeoAudit, type SeoAuditPage, type SeoAuditResult } from '../utils/seoAudit'
import { CHINA_CITY_CATALOG } from '../utils/chinaCityCatalog'
import { getGlobalSeoKeywords as getProfileGlobalSeoKeywords, getSiteProfile } from '../utils/siteProfile'
import { errorMessage } from '../utils/errors'
import { escapeLike } from '../utils/geo'
import { getImageStore, saveImageStore } from '../utils/imageSettings'
import { getProtectedSecret, hasProtectedSecret, saveProtectedSecret } from '../utils/protectedSecrets'
import { generateAiKeywords } from '../utils/aiKeywords'
import { analyzeNewsSource, publishAnalyzedNewsCandidate, runNewsCollection } from '../cron/newsCollector'
import { uploadPageImage, deletePageImage, removeImage } from '../utils/pageImages'
import { getTodayViews, getRecentViewTrend } from '../utils/stats'
import { clearKnownKvProbes, clearTransientKvBatch, deleteProductionD1Batch, deleteProductionSettingsBatch, deleteR2PrefixBatch, removePageContact, removeImageStoreGroup, deleteArticleD1Relations } from '../utils/resourceCleanup'
import { SUBPROJECT_SECTIONS, normalizeSubprojectLayout, normalizeSubprojectSlug, parseSubprojectItems, subprojectPagePath } from '../utils/subprojects'
import { renderLayout, escapeHtml } from '../templates/layout'
import { renderArticlePage } from '../templates/public'
import {
  renderLoginPage, renderSetupPage, renderRecoverPage, renderDashboard, renderArticlesList, renderArticleForm, renderArticleAiPreview,
  renderCitiesList, renderKeywordsList, renderKeywordForm, renderMessagesList, renderNewsSourcesList,
  renderSeoPage, renderGeoPage, renderSocialDistributionPage, renderSettingsPage, renderCityForm, renderServiceForm, renderCollectionLogsList,
  renderSystemPage, renderAiSettingsPage, renderAiPromptsPage, renderAdminLayout, renderWechatEditor, renderSocialHub, renderSocialEditor, renderMediaPage, renderAdminUsersPage, renderPageSettingsPage, renderSubprojectsList, renderSubprojectForm,
} from '../templates/admin'

export const adminRoutes = new Hono<{ Bindings: Bindings }>()

// ---------- 首次部署初始化管理员账号（无需鉴权，仅当还没有任何管理员时可用）----------
// 配置了 SETUP_TOKEN 时，创建首个管理员必须携带该令牌，避免部署后被陌生人抢先初始化。
const setupPage = (c: { env: Bindings }, error?: string) => renderSetupPage(error, { requireToken: !!c.env.SETUP_TOKEN })

adminRoutes.get('/setup', async (c) => {
  if (!c.env.DB) return c.html(setupPage(c, '系统正在初始化，请稍后重试。'))
  try {
    const count = (await c.env.DB.prepare('SELECT COUNT(*) as n FROM admin_users').first()) as any
    if (count.n > 0) return c.redirect('/admin/login')
    return c.html(setupPage(c))
  } catch (e) {
    console.error('D1 setup check failed', e)
    return c.html(setupPage(c, '系统正在初始化，请稍后重试。'))
  }
})

adminRoutes.post('/setup', async (c) => {
  if (!c.env.DB) return c.html(setupPage(c, 'D1 数据库未绑定。请先在 Cloudflare 中绑定变量 DB。'))
  let count: any
  try {
    count = (await c.env.DB.prepare('SELECT COUNT(*) as n FROM admin_users').first()) as any
  } catch (e) {
    console.error('D1 setup write check failed', e)
    return c.html(setupPage(c, '系统正在初始化，请稍后重试。'))
  }
  if (count.n > 0) return c.redirect('/admin/login')
  const b = await c.req.parseBody()
  if (c.env.SETUP_TOKEN && !timingSafeEqual(String(b.setup_token || '').trim(), c.env.SETUP_TOKEN)) {
    return c.html(setupPage(c, '初始化令牌不正确。请填写在 Cloudflare Secret 中配置的 SETUP_TOKEN。'), 403)
  }
  const email = String(b.email || '').trim().toLowerCase()
  const password = String(b.password || '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.html(setupPage(c, '请填写正确的管理员邮箱'))
  }
  const passwordError = validatePasswordStrength(password, email)
  if (passwordError) return c.html(setupPage(c, passwordError))
  let hash: string
  try {
    hash = await hashPassword(password, getPbkdf2Iterations(c.env))
  } catch (e) {
    console.error('admin setup password hashing failed', e)
    return c.html(setupPage(c, '管理员密码加密失败，请稍后重试；请确认最新版本已经部署。'))
  }
  let created: any
  try {
    // 原子首个管理员创建：只有 admin_users 仍为空时才插入，避免两个并发 setup 请求同时创建账号。
    created = await c.env.DB.prepare(
      `INSERT INTO admin_users (email, password_hash, role)
       SELECT ?, ?, 'admin'
       WHERE NOT EXISTS (SELECT 1 FROM admin_users)
       RETURNING id`
    ).bind(email, hash).first()
  } catch (e) {
    console.error('admin setup insert failed', e)
    return c.html(setupPage(c, '管理员账号创建失败，请检查 D1 状态后重试。'))
  }

  if (!created?.id) return c.redirect('/admin/login')

  // 只有真正创建首个管理员的请求才初始化 JWT secret。
  // 先完成 D1 的原子抢占，再生成/持久化密钥，避免两个并发 setup 请求
  // 在 CACHE_KV 尚未有密钥时各自生成不同 secret，导致刚签发的会话立即失效。
  let jwtSecret: string
  try {
    jwtSecret = await getJwtSecret(c.env)
  } catch (e) {
    console.error('JWT secret initialization failed', e)
    return c.html(setupPage(c, '登录密钥初始化失败。请确认 CACHE_KV 已绑定，或在 Cloudflare Secret 中设置 JWT_SECRET。'))
  }

  try {
    await saveSetting(c.env, 'seed_state', 'installed')
  } catch (e) {
    console.warn('mark starter seed state installed failed', e)
  }

  const token = await signToken(
    { uid: Number(created.id), email, role: 'admin' },
    jwtSecret,
  )
  c.header('Set-Cookie', `admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`)
  return c.redirect('/admin')
})

// ---------- 登录 / 登出（无需鉴权）----------
adminRoutes.get('/recover', async (c) => {
  return c.html(renderRecoverPage(c.req.query('error') || ''))
})

adminRoutes.post('/recover', async (c) => {
  const b = await c.req.parseBody()
  const setupToken = String(b.setup_token || '').trim()
  if (!c.env.SETUP_TOKEN || !setupToken || !timingSafeEqual(setupToken, c.env.SETUP_TOKEN)) {
    return c.html(renderRecoverPage('恢复令牌不正确。请使用首次部署时设置的 Cloudflare Secret：SETUP_TOKEN。'), 403)
  }
  const email = String(b.email || '').trim().toLowerCase()
  const password = String(b.password || '')
  const passwordError = validatePasswordStrength(password, email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.html(renderRecoverPage('请填写正确的管理员邮箱。'), 400)
  if (passwordError) return c.html(renderRecoverPage(passwordError), 400)
  const user = await c.env.DB.prepare('SELECT id FROM admin_users ORDER BY id LIMIT 1').first() as any
  if (!user) return c.redirect('/admin/setup')
  const hash = await hashPassword(password, getPbkdf2Iterations(c.env))
  await c.env.DB.prepare('UPDATE admin_users SET email=?, password_hash=?, role=\'admin\' WHERE id=?').bind(email, hash, user.id).run()
  return c.redirect('/admin/login?recovered=1')
})

adminRoutes.get('/login', async (c) => {
  if (!c.env.DB) return c.html(renderLoginPage('系统正在初始化，请稍后重试。'))
  try {
    const count = (await c.env.DB.prepare('SELECT COUNT(*) as n FROM admin_users').first()) as any
    if (Number(count?.n || 0) === 0) return c.redirect('/admin/setup')
  } catch (e) {
    console.error('D1 login bootstrap check failed', e)
    return c.html(renderLoginPage('系统正在初始化，请稍后重试。'))
  }
  return c.html(renderLoginPage(c.req.query('recovered') === '1' ? '管理员账号已恢复，请使用新密码登录。' : undefined))
})

adminRoutes.post('/login', async (c) => {
  const body = await c.req.parseBody()
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  if (!c.env.DB) return c.html(renderLoginPage('系统正在初始化，请稍后重试。'))
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
  if (await isLoginLocked(c.env.CACHE_KV, email, ip)) {
    return c.html(renderLoginPage(`登录失败次数过多，请 ${Math.round(LOGIN_LOCK_SECONDS / 60)} 分钟后再试`), 429)
  }
  let user: any
  try {
    user = await c.env.DB.prepare('SELECT * FROM admin_users WHERE email = ?').bind(email).first()
  } catch (e) {
    console.error('D1 login query failed', e)
    return c.html(renderLoginPage('系统正在初始化，请稍后重试。'))
  }
  const targetIterations = getPbkdf2Iterations(c.env)
  // 用户不存在时也做一次等价的 PBKDF2 计算，避免通过响应时间枚举管理员邮箱。
  const passwordCheck = await verifyPassword(password, String(user?.password_hash || DUMMY_PASSWORD_HASH), targetIterations)
  if (!user || !passwordCheck.valid) {
    await recordLoginFailure(c.env.CACHE_KV, email, ip)
    return c.html(renderLoginPage('邮箱或密码错误'))
  }
  await clearLoginFailures(c.env.CACHE_KV, email, ip)
  // 旧版本哈希 / 迭代次数低于当前目标时，首次登录成功后立即升级为当前哈希。
  if (passwordCheck.needsUpgrade) {
    try {
      const upgradedHash = await hashPassword(password, targetIterations)
      await c.env.DB.prepare('UPDATE admin_users SET password_hash=? WHERE id=?').bind(upgradedHash, user.id).run()
    } catch (e) {
      console.warn('admin password hash upgrade failed', e)
    }
  }
  let jwtSecret: string
  try {
    jwtSecret = await getJwtSecret(c.env)
  } catch (e) {
    console.error('JWT secret initialization failed', e)
    return c.html(renderLoginPage('登录密钥尚未初始化，请确认 CACHE_KV 已绑定，或设置 JWT_SECRET'))
  }
  const token = await signToken({ uid: (user as any).id, email }, jwtSecret)
  c.header('Set-Cookie', `admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`)
  return c.redirect('/admin')
})

adminRoutes.get('/logout', (c) => {
  c.header('Set-Cookie', 'admin_session=; Path=/; Max-Age=0')
  return c.redirect('/admin/login')
})

// ---------- 以下路由需要登录 ----------
adminRoutes.use('*', requireAdmin)

// ---- 管理用户：管理员可新增/修改/停用登录账号 ----
async function getCurrentAdmin(c: any) {
  const token = getCookie(c.req.raw, 'admin_session')
  const secret = await getJwtSecret(c.env)
  const payload = await verifyToken(token, secret)
  const id = Number(payload?.uid || 0)
  if (!id) return null
  return await c.env.DB.prepare('SELECT id, email, role FROM admin_users WHERE id=?').bind(id).first() as any
}

async function requireUserManager(c: any) {
  const me = await getCurrentAdmin(c)
  if (!me || me.role !== 'admin') return null
  return me
}

adminRoutes.get('/users', async (c) => {
  const me = await requireUserManager(c)
  if (!me) return c.text('没有管理用户的权限', 403)
  const rows = (await c.env.DB.prepare(
    'SELECT id, email, role, created_at FROM admin_users ORDER BY id'
  ).all()).results as any[]
  return c.html(renderAdminUsersPage(rows))
})

// 新增管理账号已关闭：系统仅允许一个默认管理员。
adminRoutes.post('/users/:id/edit', async (c) => {
  const me = await requireUserManager(c)
  if (!me) return c.text('没有管理用户的权限', 403)
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  const b = await c.req.parseBody()
  const email = String(b.email || '').trim().toLowerCase()
  const role = 'admin'
  const password = String(b.password || '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.text('邮箱格式不正确', 400)
  if (password) {
    const passwordError = validatePasswordStrength(password, email)
    if (passwordError) return c.text(passwordError, 400)
  }

  if (id !== Number(me.id)) return c.text('系统只允许修改当前唯一管理员账号', 403)
  const target = await c.env.DB.prepare('SELECT id, email, role FROM admin_users WHERE id=?').bind(id).first() as any
  if (!target) return c.notFound()

  // 唯一管理员固定为 admin。

  try {
    if (password) {
      const hash = await hashPassword(password, getPbkdf2Iterations(c.env))
      await c.env.DB.prepare('UPDATE admin_users SET email=?, password_hash=?, role=? WHERE id=?')
        .bind(email, hash, role, id).run()
    } else {
      await c.env.DB.prepare('UPDATE admin_users SET email=?, role=? WHERE id=?')
        .bind(email, role, id).run()
    }
  } catch (e) {
    console.error('update admin user failed', e)
    return c.text('保存失败：邮箱可能已经存在', 400)
  }
  return c.redirect('/admin/users')
})

adminRoutes.post('/users/:id/delete', async (c) => {
  const me = await requireUserManager(c)
  if (!me) return c.text('没有管理用户的权限', 403)
  const id = Number(c.req.param('id'))
  if (!id || id === Number(me.id)) return c.text('不能删除当前登录账号', 400)
  const count = (await c.env.DB.prepare('SELECT COUNT(*) as n FROM admin_users').first()) as any
  if (Number(count?.n || 0) <= 1) return c.text('系统只保留一个管理员账号', 400)
  await c.env.DB.prepare('DELETE FROM admin_users WHERE id=?').bind(id).run()
  return c.redirect('/admin/users')
})

adminRoutes.get('/', async (c) => {
  const env = c.env
  const [summary, trend, topKeywords] = await Promise.all([
    env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM articles) AS articles,
        (SELECT COUNT(*) FROM articles WHERE created_at >= date('now') AND created_at < date('now','+1 day')) AS today,
        (SELECT COUNT(*) FROM articles WHERE status='pending_review') AS pending,
        (SELECT COUNT(*) FROM keywords) AS keywords,
        COALESCE((SELECT views FROM daily_stats WHERE date = date('now')), 0) AS today_views`
    ).first(),
    getRecentViewTrend(env, 7),
    env.DB.prepare(
      `SELECT k.keyword, k.opportunity_score, ci.name as city_name, s.name as service_name
       FROM keywords k LEFT JOIN cities ci ON ci.id = k.city_id LEFT JOIN services s ON s.id = k.service_id
       ORDER BY k.opportunity_score DESC LIMIT 5`
    ).all().then((r) => r.results as any[]),
  ])
  const s = summary as any
  return c.html(renderDashboard({
    articles: Number(s?.articles || 0),
    today: Number(s?.today || 0),
    pending: Number(s?.pending || 0),
    keywords: Number(s?.keywords || 0),
    todayViews: Number(s?.today_views || 0),
    trend,
    topKeywords,
  }))
})

// ---- 文章管理 ----
adminRoutes.get('/articles', async (c) => {
  const statusFilter = c.req.query('status')
  const where = statusFilter ? `WHERE a.status = ?` : ''
  const stmt = c.env.DB.prepare(
    `SELECT a.id, a.title, a.category, a.city_id, a.status, a.source_name, a.ai_generated,
            a.credibility_score, a.reject_reason, a.created_at, ci.name as city_name
     FROM articles a LEFT JOIN cities ci ON ci.id = a.city_id ${where}
     ORDER BY a.created_at DESC LIMIT 100`
  )
  const rows = (statusFilter ? await stmt.bind(statusFilter).all() : await stmt.all()).results
  return c.html(renderArticlesList(rows as any, statusFilter))
})

adminRoutes.get('/articles/new', (c) => c.html(renderArticleForm(undefined, undefined, String(c.req.query('error') || '').trim())))

adminRoutes.post('/articles/ai-preview', async (c) => {
  const b = await c.req.parseBody()
  const title = String(b.title || '').trim()
  const target = String(b.article_id || '').trim()
    ? '/admin/articles/' + encodeURIComponent(String(b.article_id || '').trim()) + '/edit'
    : '/admin/articles/new'
  if (!title) return c.redirect(target + '?error=' + encodeURIComponent('请先填写文章标题，再生成 AI 正文预览。'))
  const summary = String(b.summary || '').trim()
  const globalSeoKeywords = await getGlobalSeoKeywords(c.env)
  const routeStatus = await getAiRouteStatus(c.env)
  if (!routeStatus.ok) return c.redirect(target + '?error=' + encodeURIComponent(routeStatus.message))
  let ai: Awaited<ReturnType<typeof generateAiPageContent>>
  try {
    ai = await generateAiPageContent(
      c.env,
      { type: 'article', title, summary, keywords: getArticleAiKeywords(title, summary) },
      routeStatus.settings,
    )
  } catch (e) {
    console.error('AI article preview generation failed', e)
    return c.redirect(target + '?error=' + encodeURIComponent(errorMessage(e, 'AI文章预览生成失败').slice(0, 220)))
  }
  if (!ai) return c.redirect(target + '?error=' + encodeURIComponent(
    aiEmptyResultMessage('AI文章生成', routeStatus.settings).slice(0, 220)
  ))
  return c.html(renderArticleAiPreview({
    articleId: String(b.article_id || '').trim(),
    title,
    slug: String(b.slug || '').trim(),
    category: String(b.category || '').trim(),
    summary,
    seoTitle: autoArticleSeo({ title, summary: ai.summary || summary, content: ai.content }, c.env.SITE_NAME || '网站内容平台', globalSeoKeywords).seo_title,
    seoDescription: autoArticleSeo({ title, summary: ai.summary || summary, content: ai.content }, c.env.SITE_NAME || '网站内容平台', globalSeoKeywords).seo_description,
    seoKeywords: autoArticleSeo({ title, summary: ai.summary || summary, content: ai.content }, c.env.SITE_NAME || '网站内容平台', globalSeoKeywords).seo_keywords,
    aiTitle: ai.title,
    aiSummary: ai.summary,
    aiContent: ai.content,
  }))
})

adminRoutes.post('/articles/ai-publish', async (c) => {
  const b = await c.req.parseBody()
  const id = String(b.article_id || '').trim()
  const title = String(b.title || '').trim()
  if (!title) return c.text('请先填写文章标题。', 400)
  const summary = String(b.summary || '').trim()
  const category = String(b.category || '').trim()
  const requestedSlug = String(b.slug || '').trim()
  let ai: Awaited<ReturnType<typeof generateAiPageContent>>
  try {
    ai = await generateAiPageContent(c.env, { type: 'article', title, summary, keywords: getArticleAiKeywords(title, summary) })
  } catch (e) {
    console.error('AI article generation failed', e)
    return c.text(errorMessage(e, 'AI文章生成失败'), 503)
  }
  if (!ai) return c.text('AI 未返回满足质量门槛的文章内容，请检查「AI设置」中的开关和模型。', 503)
  const finalSummary = ai.summary || summary
  const globalSeoKeywords = await getGlobalSeoKeywords(c.env)
  const seo = autoArticleSeo({ title, summary: finalSummary, content: ai.content }, c.env.SITE_NAME || '网站内容平台', globalSeoKeywords)
  const cardSvg = await generateInterpretationCard(c.env, { title, summary: finalSummary })
  if (id) {
    const existing = await c.env.DB.prepare('SELECT id FROM articles WHERE id=?').bind(id).first()
    if (!existing) return c.notFound()
    await c.env.DB.prepare("UPDATE articles SET title=?, category=?, summary=?, content=?, status='pending_review', ai_generated=1, seo_title=?, seo_description=?, seo_keywords=?, card_svg=?, published_at=NULL, updated_at=datetime('now') WHERE id=?").bind(title, category, finalSummary, ai.content, seo.seo_title, seo.seo_description, seo.seo_keywords, cardSvg, id).run()
    await c.env.DB.prepare("INSERT INTO review_logs (article_id, action, operator, note) VALUES (?, ?, ?, ?)").bind(id, 'ai_generate', 'AI', 'AI生成正文 + SEO 完成，进入人工审核，暂不公开').run()
  } else {
    const slug = requestedSlug || ('article-' + Date.now())
    const inserted = await c.env.DB.prepare("INSERT INTO articles (title, slug, category, summary, content, status, ai_generated, seo_title, seo_description, seo_keywords, card_svg, published_at) VALUES (?, ?, ?, ?, ?, 'pending_review', 1, ?, ?, ?, ?, NULL) RETURNING id").bind(title, slug, category, finalSummary, ai.content, seo.seo_title, seo.seo_description, seo.seo_keywords, cardSvg).first() as any
    if (!inserted?.id) return c.text('文章写入成功但未取得文章ID，请重试。', 500)
    await c.env.DB.prepare("INSERT INTO review_logs (article_id, action, operator, note) VALUES (?, ?, ?, ?)").bind(inserted.id, 'pending_review', 'AI', 'AI生成正文 + SEO 完成，进入人工审核，暂不公开').run()
  }
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/articles?status=pending_review')
})

adminRoutes.post('/articles/:id/ai-optimize', async (c) => {
  const id = c.req.param('id')
  const article = await c.env.DB.prepare('SELECT * FROM articles WHERE id=? LIMIT 1').bind(id).first() as any
  if (!article) return c.notFound()

  const globalSeoKeywords = await getGlobalSeoKeywords(c.env)
  try {
    const ai = await generateAiPageContent(c.env, {
      type: 'article',
      title: String(article.title || ''),
      summary: String(article.summary || ''),
      keywords: getArticleAiKeywords(String(article.title || ''), String(article.summary || '')),
      sourceContent: String(article.content || '').slice(0, 6000),
    })
    if (!ai) {
      return c.redirect('/admin/articles/' + id + '/edit?error=' + encodeURIComponent('AI优化未得到可保存内容，请到「AI设置」执行 Workers AI 测试后再重试'))
    }

    const sourceUrl = String(article.source_url || '').trim()
    const sourceLink = sourceUrl
      ? '<p><strong>原文章链接：</strong><a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="nofollow noopener">' + escapeHtml(sourceUrl) + '</a></p>'
      : ''
    const content = String(ai.content || '').trim() + sourceLink
    const seo = autoArticleSeo(
      { title: ai.title || article.title, summary: ai.summary || article.summary, content: ai.content },
      c.env.SITE_NAME || '网站内容平台',
      globalSeoKeywords,
    )

    const wasPublished = String(article.status || '') === 'published'
    await c.env.DB.prepare(
      'UPDATE articles SET title=?, summary=?, content=?, seo_title=?, seo_description=?, seo_keywords=?, status=CASE WHEN status=\'published\' THEN \'pending_review\' ELSE status END, updated_at=datetime(\'now\') WHERE id=?'
    ).bind(
      String(ai.title || article.title).trim(),
      String(ai.summary || article.summary).trim(),
      content,
      seo.seo_title,
      seo.seo_description,
      seo.seo_keywords,
      id,
    ).run()
    await c.env.DB.prepare(
      'INSERT INTO review_logs (article_id, action, operator, note) VALUES (?, ?, ?, ?)'
    ).bind(id, 'ai_optimize', 'AI自动', wasPublished
      ? 'AI优化已使原公开文章撤回待审核；原文章链接已保留。'
      : 'AI优化现有文章；原文章链接已保留。').run()

    if (wasPublished) {
      const updatedSiteUrl = resolveSiteUrl(c)
      notifyDeletedUrl(
        c.env,
        updatedSiteUrl + '/article/' + encodeURIComponent(String(article.slug || id)),
        updatedSiteUrl,
        c.executionCtx,
      )
    }

    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    return c.redirect('/admin/articles/' + id + '/edit?ai=1')
  } catch (e) {
    console.error('AI article optimize failed', e)
    return c.redirect('/admin/articles/' + id + '/edit?error=' + encodeURIComponent(errorMessage(e, 'AI优化失败')))
  }
})

adminRoutes.post('/articles/new', async (c) => {
  const b = await c.req.parseBody()
  const slug = String(b.slug || '').trim() || `article-${Date.now()}`
  const globalSeoKeywords = await getGlobalSeoKeywords(c.env)
  let requestedStatus = ['draft', 'pending_review', 'published'].includes(String(b.status || ''))
    ? String(b.status)
    : 'draft'
  // AI 预览页提交不得直接发布，必须进入人工审核
  if (String(b.from_ai_preview || '') === '1' && requestedStatus === 'published') {
    requestedStatus = 'pending_review'
  }
  let articleContent = String(b.content || '').trim()
  let aiDraftGenerated = false
  if (!articleContent) {
    aiDraftGenerated = true
    const ai = await generateAiPageContent(c.env, { type: 'article', title: String(b.title || ''), summary: String(b.summary || ''), keywords: getArticleAiKeywords(String(b.title || ''), String(b.summary || '')) })
    articleContent = ai?.content || '<p>请补充文章正文。</p>'
  }
  const finalStatus = (aiDraftGenerated || String(b.from_ai_preview || '') === '1')
    ? statusAfterAiDraft(requestedStatus)
    : requestedStatus
  const generatedSeo = autoArticleSeo(
    { title: String(b.title || ''), summary: String(b.summary || ''), content: articleContent },
    c.env.SITE_NAME || '网站内容平台',
    globalSeoKeywords,
  )
  const seoTitle = generatedSeo.seo_title
  const seoDescription = generatedSeo.seo_description
  const seoKeywords = generatedSeo.seo_keywords
  let cardSvg: string | null = null
  if (finalStatus === 'published') {
    cardSvg = await generateInterpretationCard(c.env, { title: String(b.title), summary: String(b.summary || '') })
  }
  await c.env.DB.prepare(
    `INSERT INTO articles (title, slug, category, summary, content, status, seo_title, seo_description, seo_keywords, card_svg, cover_image, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'published' THEN datetime('now') ELSE NULL END)`
  ).bind(
    b.title, slug, b.category || '', b.summary || '', articleContent, finalStatus,
    seoTitle, seoDescription, seoKeywords, cardSvg, String(b.cover_image || '').trim().slice(0, 500), finalStatus
  ).run()
  const created = await c.env.DB.prepare('SELECT id FROM articles WHERE slug=?').bind(slug).first() as any
  if (created?.id) {
    if (aiDraftGenerated) {
      await c.env.DB.prepare(
        'INSERT INTO review_logs (article_id, action, operator, note) VALUES (?, ?, ?, ?)'
      ).bind(created.id, 'ai_generate', 'AI', '空正文由 AI 辅助补齐，已进入人工审核；不能因表单选择直接公开。').run()
    }
    if (finalStatus === 'published') {
      const publishedSiteUrl = resolveSiteUrl(c)
      notifyPublishedUrl(
        c.env,
        publishedSiteUrl + '/article/' + encodeURIComponent(slug),
        publishedSiteUrl,
        c.executionCtx,
      )
      c.executionCtx.waitUntil(
        syncPublishedArticleToDomesticPlatforms(c.env, Number(created.id)).catch((e) => console.error('new published article platform sync failed', e))
      )
    }
  }
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/articles')
})
adminRoutes.get('/articles/:id/edit', async (c) => {
  const article = await c.env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(c.req.param('id')).first()
  if (!article) return c.notFound()
  const settings = await readSettingsMap(c.env)
  const pageContact = getPageContact(settings, 'article:' + String((article as any).id), getContactMethods(settings))
  const error = String(c.req.query('error') || '').trim()
  return c.html(renderArticleForm(article, pageContact, error))
})

adminRoutes.post('/articles/:id/edit', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.parseBody()
  const existing = await c.env.DB.prepare('SELECT status, card_svg, slug FROM articles WHERE id=?').bind(id).first() as any
  if (!existing) return c.notFound()

  let status: 'draft' | 'pending_review' | 'published' = ['draft', 'pending_review', 'published'].includes(String(b.status || ''))
    ? String(b.status) as 'draft' | 'pending_review' | 'published'
    : (['draft', 'pending_review', 'published'].includes(String(existing.status || '')) ? String(existing.status) as 'draft' | 'pending_review' | 'published' : 'draft')
  let aiDraftGenerated = false

  let slug = String(b.slug || existing.slug || '').trim().replace(/^\/+|\/+$/g, '')
  if (!slug) slug = 'article-' + id
  const sameSlug = await c.env.DB.prepare('SELECT id FROM articles WHERE slug=? AND id<>? LIMIT 1').bind(slug, id).first()
  if (sameSlug) slug = slug + '-' + id

  const globalSeoKeywords = await getGlobalSeoKeywords(c.env)
  if (String(b.from_ai_preview || '') === '1' && status === 'published') {
    status = 'pending_review'
  }
  let articleContent = String(b.content || '').trim()
  if (!articleContent) {
    aiDraftGenerated = true
    const ai = await generateAiPageContent(c.env, { type: 'article', title: String(b.title || ''), summary: String(b.summary || ''), keywords: getArticleAiKeywords(String(b.title || ''), String(b.summary || '')) })
    articleContent = ai?.content || '<p>请补充文章正文。</p>'
    status = statusAfterAiDraft(status)
  }
  let cardSvg = existing?.card_svg || null
  if (status === 'published' && !cardSvg) {
    cardSvg = await generateInterpretationCard(c.env, { title: String(b.title), summary: String(b.summary || '') })
  }
  const generatedSeo = autoArticleSeo(
    { title: String(b.title || ''), summary: String(b.summary || ''), content: articleContent },
    c.env.SITE_NAME || '网站内容平台',
    globalSeoKeywords,
  )
  const seoTitle = generatedSeo.seo_title
  const seoDescription = generatedSeo.seo_description
  const seoKeywords = generatedSeo.seo_keywords
  const wasPublished = String(existing.status || '') === 'published'
  const oldSlug = String(existing.slug || '').trim()
  await c.env.DB.prepare(
    `UPDATE articles SET title=?, slug=?, category=?, summary=?, content=?, status=?,
       seo_title=?, seo_description=?, seo_keywords=?, card_svg=?, cover_image=?, updated_at=datetime('now'),
       published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN datetime('now') ELSE published_at END
     WHERE id=?`
  ).bind(
    b.title, slug, b.category || '', b.summary || '', articleContent, status,
    seoTitle, seoDescription, seoKeywords, cardSvg, String(b.cover_image || '').trim().slice(0, 500), status, id
  ).run()

  if (aiDraftGenerated) {
    await c.env.DB.prepare(
      'INSERT INTO review_logs (article_id, action, operator, note) VALUES (?, ?, ?, ?)'
    ).bind(id, 'ai_generate', 'AI', '空正文由 AI 辅助补齐，已进入人工审核；请人工确认后再发布。').run()
  }

  const changedSiteUrl = resolveSiteUrl(c)
  const changedArticleUrl = changedSiteUrl + '/article/' + encodeURIComponent(slug)
  if (wasPublished && oldSlug && oldSlug !== slug) {
    notifyDeletedUrl(
      c.env,
      changedSiteUrl + '/article/' + encodeURIComponent(oldSlug),
      changedSiteUrl,
      c.executionCtx,
    )
  }
  if (status === 'published') {
    notifyPublishedUrl(c.env, changedArticleUrl, changedSiteUrl, c.executionCtx)
  } else if (wasPublished && oldSlug === slug) {
    notifyDeletedUrl(c.env, changedArticleUrl, changedSiteUrl, c.executionCtx)
  }

  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/articles')
})

adminRoutes.post('/articles/:id/publish', async (c) => {
  const id = String(c.req.param('id') || '').trim()
  const article = await c.env.DB.prepare('SELECT * FROM articles WHERE id=? LIMIT 1').bind(id).first() as any
  if (!article) return c.notFound()

  const title = String(article.title || '').trim()
  if (!title) return c.redirect('/admin/articles/' + encodeURIComponent(id) + '/edit?error=' + encodeURIComponent('文章标题不能为空，无法生成前台页面。'))

  const content = String(article.content || '').trim()
  if (!content || content === '<p>请补充文章正文后再发布。</p>') {
    return c.redirect('/admin/articles/' + encodeURIComponent(id) + '/edit?error=' + encodeURIComponent('文章正文为空：请先使用 AI 预览/辅助写作或人工编辑，完成审核后再发布。'))
  }

  const globalSeoKeywords = await getGlobalSeoKeywords(c.env)
  const seo = autoArticleSeo(
    { title, summary: String(article.summary || ''), content },
    c.env.SITE_NAME || '网站内容平台',
    globalSeoKeywords,
  )

  let slug = String(article.slug || '').trim().replace(/^\/+|\/+$/g, '')
  if (!slug) slug = 'article-' + id
  const sameSlug = await c.env.DB.prepare('SELECT id FROM articles WHERE slug=? AND id<>? LIMIT 1').bind(slug, id).first()
  if (sameSlug) slug = slug + '-' + id

  let cardSvg = String(article.card_svg || '').trim() || null
  if (!cardSvg) {
    try {
      cardSvg = await generateInterpretationCard(c.env, { title, summary: String(article.summary || '') })
    } catch (e) {
      console.error('article interpretation card generation failed', e)
    }
  }

  await c.env.DB.prepare(
    `UPDATE articles SET slug=?, content=?, status='published', seo_title=?, seo_description=?, seo_keywords=?, card_svg=?,
       published_at=COALESCE(published_at, datetime('now')), updated_at=datetime('now'),
       reviewed_by='admin', reviewed_at=datetime('now'), reject_reason=NULL
       WHERE id=?`
  ).bind(
    slug, content, seo.seo_title, seo.seo_description, seo.seo_keywords, cardSvg, id
  ).run()

  await c.env.DB.prepare(
    'INSERT INTO review_logs (article_id, action, operator, note) VALUES (?, ?, ?, ?)'
  ).bind(id, 'publish', '管理员', '生成/补齐前台文章页面并发布').run()

  const publishedSiteUrl = resolveSiteUrl(c)
  notifyPublishedUrl(
    c.env,
    publishedSiteUrl + '/article/' + encodeURIComponent(slug),
    publishedSiteUrl,
    c.executionCtx,
  )
  c.executionCtx.waitUntil(
    syncPublishedArticleToDomesticPlatforms(c.env, Number(id)).catch((e) => console.error('published article platform sync failed', e))
  )

  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/article/' + encodeURIComponent(slug), 302)
})

adminRoutes.post('/articles/:id/content/delete', async (c) => {
  const id = c.req.param('id')
  const article = await c.env.DB.prepare('SELECT id, slug, cover_image FROM articles WHERE id=?').bind(id).first() as any
  if (!article) return c.notFound()
  const deletedSiteUrl = resolveSiteUrl(c)
  if (String(article.slug || '').trim()) {
    notifyDeletedUrl(
      c.env,
      deletedSiteUrl + '/article/' + encodeURIComponent(String(article.slug).trim()),
      deletedSiteUrl,
      c.executionCtx,
    )
  }
  // 永久删除：文章本体、关联日志/社交记录、本页面联系方式和明确属于文章的本地封面直接删除。
  await deleteArticleD1Relations(c.env, id)
  await removePageContact(c.env, ['article:' + id])
  const cover = String(article.cover_image || '').trim()
  if (cover.startsWith('/media/')) await permanentlyDeleteMediaObject(c, 'media/' + cover.slice('/media/'.length))
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/articles')
})

adminRoutes.post('/articles/:id/delete', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  const article = await c.env.DB.prepare('SELECT id, slug, cover_image FROM articles WHERE id=?').bind(id).first() as any
  if (!article) return c.notFound()
  const deletedSiteUrl = resolveSiteUrl(c)
  if (String(article.slug || '').trim()) {
    notifyDeletedUrl(
      c.env,
      deletedSiteUrl + '/article/' + encodeURIComponent(String(article.slug).trim()),
      deletedSiteUrl,
      c.executionCtx,
    )
  }
  await deleteArticleD1Relations(c.env, id)
  await removePageContact(c.env, ['article:' + id])
  const cover = String(article.cover_image || '').trim()
  if (cover.startsWith('/media/')) await permanentlyDeleteMediaObject(c, 'media/' + cover.slice('/media/'.length))
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/articles')
})

// ---- 预览：无论草稿/待审核/已发布，都能在后台直接看到前台渲染效果 ----
adminRoutes.get('/articles/:id/preview', async (c) => {
  const article = await c.env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(c.req.param('id')).first()
  if (!article) return c.notFound()
  const art = article as any
  const siteUrl = resolveSiteUrl(c)
  const banner = `<div class="container" style="max-width:820px;margin-top:16px">
    <p style="background:#fff7e6;color:#ad6800;border:1px solid #ffe7ba;border-radius:8px;padding:10px 14px;font-size:13px">
      🔍 预览模式 · 当前状态：${escapeStatus(art.status)}，此页面不会被搜索引擎收录，也不在公开导航中出现。
    </p>
  </div>`
  const body = banner + renderArticlePage(art)
  return c.html(renderLayout({
    title: `[预览] ${art.title}`,
    siteUrl, siteName: c.env.SITE_NAME || '网站内容平台', canonical: `${siteUrl}/article/${art.slug}`,
  }, body))
})

function escapeStatus(status: string) {
  return { draft: '草稿', pending_review: '待审核', published: '已发布' }[status] || status
}

// ---- 微信排版：生成排版内容 + 一键复制，不调用任何微信API ----
adminRoutes.get('/articles/:id/wechat', async (c) => {
  const article = await c.env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(c.req.param('id')).first() as any
  if (!article) return c.notFound()

  let cityName = '全国'
  if (article.city_id) {
    const city = await c.env.DB.prepare('SELECT name FROM cities WHERE id = ?').bind(article.city_id).first() as any
    if (city) cityName = city.name
  }

  const wechatHtml = buildWechatHtml({ ...article, cityName })
  return c.html(renderWechatEditor(article, cityName, wechatHtml))
})

adminRoutes.post('/articles/:id/wechat', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.parseBody()
  const scheduledAt = String(b.wechat_scheduled_at || '').trim()
  const status = scheduledAt ? 'scheduled' : 'ready'
  await c.env.DB.prepare(
    `UPDATE articles SET wechat_title = ?, wechat_summary = ?, wechat_cover_url = ?, wechat_scheduled_at = ?,
       wechat_status = ?, wechat_synced_at = datetime('now') WHERE id = ?`
  ).bind(
    String(b.wechat_title || '') || null,
    String(b.wechat_summary || '') || null,
    String(b.wechat_cover_url || '') || null,
    scheduledAt || null,
    status,
    id
  ).run()
  return c.redirect(`/admin/articles/${id}/wechat`)
})

// 复制成功后前端会异步 ping 这个接口，只用来记录状态，不做别的
adminRoutes.post('/articles/:id/wechat/mark-copied', async (c) => {
  await c.env.DB.prepare("UPDATE articles SET wechat_status = 'copied' WHERE id = ?").bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// ---- 多平台分发：抖音 / 快手 / 小红书 / 哔哩哔哩，均未接官方API，只生成内容+一键复制 ----
async function loadArticleAndCity(env: any, id: string) {
  const article = await env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first() as any
  if (!article) return { article: null, cityName: '全国' }
  let cityName = '全国'
  if (article.city_id) {
    const city = await env.DB.prepare('SELECT name FROM cities WHERE id = ?').bind(article.city_id).first() as any
    if (city) cityName = city.name
  }
  return { article, cityName }
}

adminRoutes.get('/articles/:id/social', async (c) => {
  const { article } = await loadArticleAndCity(c.env, c.req.param('id'))
  if (!article) return c.notFound()
  const rows = (await c.env.DB.prepare('SELECT * FROM social_posts WHERE article_id = ?').bind(article.id).all()).results as any[]
  const posts: Record<string, any> = {}
  for (const r of rows) posts[r.platform] = r
  return c.html(renderSocialHub(article, PLATFORM_LIST, posts))
})

adminRoutes.get('/articles/:id/social/:platform', async (c) => {
  const platform = c.req.param('platform') as PlatformKey
  const config = PLATFORMS[platform]
  if (!config) return c.notFound()
  const { article } = await loadArticleAndCity(c.env, c.req.param('id'))
  if (!article) return c.notFound()
  const post = await c.env.DB.prepare('SELECT * FROM social_posts WHERE article_id = ? AND platform = ?').bind(article.id, platform).first() as any

  let copyPayload = ''
  if (post) {
    const data = { title: post.title || '', content: post.content || '', hashtags: post.hashtags ? String(post.hashtags).split(',').map((s: string) => s.trim()).filter(Boolean) : [] }
    copyPayload = config.copyMode === 'richtext' ? buildRichCopyHtml(data) : escapeForPreview(buildPlainCopyText(config, data))
  }
  return c.html(renderSocialEditor(article, config, post, copyPayload))
})

function escapeForPreview(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

adminRoutes.post('/articles/:id/social/:platform/generate', async (c) => {
  const platform = c.req.param('platform') as PlatformKey
  if (!PLATFORMS[platform]) return c.notFound()
  const { article, cityName } = await loadArticleAndCity(c.env, c.req.param('id'))
  if (!article) return c.notFound()

  const data = await generateSocialContent(c.env, platform, {
    title: article.title, summary: article.summary, content: article.content,
    seo_keywords: article.seo_keywords, cityName,
  })

  await c.env.DB.prepare(
    `INSERT INTO social_posts (article_id, platform, title, content, hashtags, ai_generated, status, synced_at)
     VALUES (?, ?, ?, ?, ?, 1, 'ready', datetime('now'))
     ON CONFLICT(article_id, platform) DO UPDATE SET
       title = excluded.title, content = excluded.content, hashtags = excluded.hashtags,
       ai_generated = 1, status = 'ready', synced_at = datetime('now')`
  ).bind(article.id, platform, data.title, data.content, data.hashtags.join(',')).run()

  return c.redirect(`/admin/articles/${article.id}/social/${platform}`)
})

adminRoutes.post('/articles/:id/social/:platform', async (c) => {
  const platform = c.req.param('platform') as PlatformKey
  if (!PLATFORMS[platform]) return c.notFound()
  const id = c.req.param('id')
  const b = await c.req.parseBody()
  const scheduledAt = String(b.scheduled_at || '').trim()
  await c.env.DB.prepare(
    `UPDATE social_posts SET title = ?, content = ?, hashtags = ?, scheduled_at = ?,
       status = ?, synced_at = datetime('now') WHERE article_id = ? AND platform = ?`
  ).bind(
    String(b.title || ''), String(b.content || ''), String(b.hashtags || ''),
    scheduledAt || null, scheduledAt ? 'scheduled' : 'ready', id, platform
  ).run()
  return c.redirect(`/admin/articles/${id}/social/${platform}`)
})

adminRoutes.post('/articles/:id/social/:platform/mark-copied', async (c) => {
  await c.env.DB.prepare("UPDATE social_posts SET status = 'copied' WHERE article_id = ? AND platform = ?")
    .bind(c.req.param('id'), c.req.param('platform')).run()
  return c.json({ ok: true })
})

// ---- 审核流程:通过 / 驳回 ----
adminRoutes.post('/articles/:id/approve', async (c) => {
  const id = c.req.param('id')
  const full = await c.env.DB.prepare(
    'SELECT id, slug, title, summary, content, card_svg, status FROM articles WHERE id=?'
  ).bind(id).first() as any
  if (!full) return c.notFound()
  if (String(full.status || '') !== 'pending_review') {
    return c.redirect('/admin/articles?status=' + encodeURIComponent(String(full.status || 'draft')))
  }

  const title = String(full.title || '').trim()
  const content = String(full.content || '').trim()
  if (!title || !content || content === '<p>请补充文章正文后再发布。</p>') {
    return c.redirect('/admin/articles/' + encodeURIComponent(id) + '/edit?error=' + encodeURIComponent('文章内容不完整：请补充标题和正文后再审核发布。'))
  }

  // 审核通过必须与手动发布保持同一发布契约：补齐唯一 slug、SEO 和发布时间，
  // 避免 AI/采集稿走 approve 路径时绕过公开页面所需字段。
  let slug = String(full.slug || '').trim().replace(/^\/+|\/+$/g, '')
  if (!slug) slug = 'article-' + id
  const sameSlug = await c.env.DB.prepare(
    'SELECT id FROM articles WHERE slug=? AND id<>? LIMIT 1'
  ).bind(slug, id).first()
  if (sameSlug) slug = slug + '-' + id

  const globalSeoKeywords = await getGlobalSeoKeywords(c.env)
  const seo = autoArticleSeo(
    { title, summary: String(full.summary || ''), content },
    c.env.SITE_NAME || '网站内容平台',
    globalSeoKeywords,
  )

  let cardSvg = String(full.card_svg || '').trim() || null
  if (!cardSvg) {
    cardSvg = await generateInterpretationCard(c.env, { title, summary: String(full.summary || '') })
  }

  await c.env.DB.prepare(
    `UPDATE articles SET slug=?, status='published', seo_title=?, seo_description=?, seo_keywords=?,
        card_svg=?, published_at=COALESCE(published_at, datetime('now')), reviewed_by='admin',
        reviewed_at=datetime('now'), reject_reason=NULL, updated_at=datetime('now')
        WHERE id=?`
  ).bind(slug, seo.seo_title, seo.seo_description, seo.seo_keywords, cardSvg, id).run()

  await c.env.DB.prepare('INSERT INTO review_logs (article_id, action, operator, note) VALUES (?, ?, ?, ?)')
    .bind(id, 'approve', 'admin', '人工审核通过：补齐 slug / SEO 后正式发布').run()

  const publishedSiteUrl = resolveSiteUrl(c)
  const publicUrl = publishedSiteUrl + '/article/' + encodeURIComponent(slug)
  notifyPublishedUrl(c.env, publicUrl, publishedSiteUrl, c.executionCtx)
  c.executionCtx.waitUntil(
    syncPublishedArticleToDomesticPlatforms(c.env, Number(id)).catch((e) => console.error('approved article platform sync failed', e))
  )
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/articles?status=published')
})

adminRoutes.post('/articles/:id/reject', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.parseBody()
  const reason = String(b.reason || '内容不符合发布标准')
  await c.env.DB.prepare(
    `UPDATE articles SET status='draft', reviewed_by='admin', reviewed_at=datetime('now'), reject_reason=? WHERE id=?`
  ).bind(reason, id).run()
  await c.env.DB.prepare('INSERT INTO review_logs (article_id, action, operator, note) VALUES (?, ?, ?, ?)').bind(id, 'reject', 'admin', reason).run()
  return c.redirect('/admin/articles?status=pending_review')
})

// ---- 城市管理 ----
async function readSettingsMap(env: Bindings): Promise<Record<string, string>> {
  const rows = (await env.DB.prepare("SELECT key, value FROM settings WHERE key NOT LIKE 'ai_page:%'").all()).results as any[]
  const map: Record<string, string> = {}
  for (const row of rows) map[String(row.key)] = String(row.value ?? '')
  return map
}

async function saveSetting(env: Bindings, key: string, value: string) {
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(key, value).run()
}

async function getGlobalSeoKeywords(env: Bindings): Promise<string> {
  const profile = getSiteProfile(await readSettingsMap(env), env.SITE_NAME || '')
  return getProfileGlobalSeoKeywords(profile, 20).join(',')
}

function getKeywordList(value = ''): string[] {
  return normalizeKeywordCandidates(value, 15)
}

function getArticleAiKeywords(title: string, summary = ''): string[] {
  return buildArticleSeoKeywords(title, summary)
}

async function getAiRouteStatus(env: Bindings): Promise<{ ok: true; settings: Awaited<ReturnType<typeof getAiSettings>> } | { ok: false; message: string }> {
  const settings = await getAiSettings(env)
  if (!settings.enabled) {
    return { ok: false, message: 'AI 内容生成当前已关闭：请进入「AI设置」开启 AI 内容生成并保存。' }
  }

  if (settings.provider === 'workers_ai') {
    if (!env.AI || typeof (env.AI as any).run !== 'function') {
      return { ok: false, message: '当前通道为 Workers AI，但 Binding “AI” 未生效：请在 Cloudflare Worker → Settings → Bindings 检查 AI 绑定并重新部署。' }
    }
  } else {
    if (!(await hasProtectedSecret(env, 'EXTERNAL_AI_API_KEY')) && !String(env.EXTERNAL_AI_API_KEY || '').trim()) {
      return { ok: false, message: '当前通道为外部 OpenAI-compatible API，但 API Key 未配置。请进入后台「AI设置」填写；也可使用 Cloudflare Secret EXTERNAL_AI_API_KEY 作为兼容兜底。' }
    }
    if (!settings.externalBaseUrl) {
      return { ok: false, message: '外部 AI API 地址未配置或不是 HTTPS 公网地址，请到「AI设置」填写 API Base URL。' }
    }
    if (!settings.externalModel) {
      return { ok: false, message: '外部 AI 模型名称未配置，请到「AI设置」填写模型名称。' }
    }
  }
  return { ok: true, settings }
}

function aiEmptyResultMessage(task: string, settings: Awaited<ReturnType<typeof getAiSettings>>): string {
  const providerLabel = settings.provider === 'workers_ai' ? 'Workers AI' : '外部 OpenAI-compatible API'
  const model = settings.provider === 'workers_ai' ? settings.model : settings.externalModel
  return task + '已调用' + providerLabel + '，但没有得到可保存的有效内容。当前模型：' + model + '。AI 连通性测试成功只代表模型能返回文本；页面生成还需要符合当前任务的 JSON/HTML 结构和长度要求。请在「AI提示词」检查对应任务是否被改得过短或改成了其他输出格式。'
}

async function getCityAiKeywords(env: Bindings, cityId: number, cityName: string, globalKeywords = ''): Promise<string[]> {
  const rows = (await env.DB.prepare(
    'SELECT keyword FROM keywords WHERE city_id=? AND COALESCE(opportunity_score,0)>0 ORDER BY opportunity_score DESC, search_volume DESC, id ASC LIMIT 5'
  ).bind(cityId).all()).results as any[]
  const discovered = rows.map((row) => String(row.keyword || '').trim()).filter(Boolean)
  const siteTopics = normalizeKeywordCandidates(globalKeywords, 20)
  const profile = getSiteProfile(await readSettingsMap(env), env.SITE_NAME || '')
  const fallback = [
    cityName + profile.topic,
    cityName + '服务',
    cityName + '流程',
    cityName + '注意事项',
  ]
  return normalizeSeoKeywords([...fallback, ...discovered, ...siteTopics.map((keyword) => cityName + keyword)], 5)
}

async function getServiceAiKeywords(env: Bindings, serviceId: number, serviceName: string, globalKeywords = ''): Promise<string[]> {
  const rows = (await env.DB.prepare(
    'SELECT keyword FROM keywords WHERE service_id=? AND COALESCE(opportunity_score,0)>0 ORDER BY opportunity_score DESC, search_volume DESC, id ASC LIMIT 5'
  ).bind(serviceId).all()).results as any[]
  const discovered = rows.map((row) => String(row.keyword || '').trim()).filter(Boolean)
  const siteTopics = normalizeKeywordCandidates(globalKeywords, 15)
  const fallback = [serviceName, serviceName + '办理', serviceName + '流程', serviceName + '注意事项']
  const relevantSiteTopics = siteTopics.filter((keyword) =>
    serviceName.includes(keyword) || keyword.includes(serviceName)
  )
  return normalizeSeoKeywords([
    serviceName,
    serviceName + '办理',
    serviceName + '流程',
    serviceName + '注意事项',
    ...relevantSiteTopics,
    ...discovered,
    ...fallback,
  ], 5)
}


type SeoAuditView = SeoAuditPage & { audit: SeoAuditResult; dbId?: number }

async function buildPublicSeoAudit(env: Bindings): Promise<{ pages: SeoAuditView[]; summary: ReturnType<typeof summarizeSeoAudit> }> {
  const [settingsRows, cityRows, serviceRows, articleRows, keywordRows] = await Promise.all([
    env.DB.prepare("SELECT key, value FROM settings WHERE key NOT LIKE 'ai_prompt_%'").all(),
    env.DB.prepare("SELECT id, name, slug, is_active, seo_title, seo_description, seo_keywords FROM cities ORDER BY id").all(),
    env.DB.prepare("SELECT id, name, slug, summary, is_active, seo_title, seo_description, seo_keywords FROM services ORDER BY id").all(),
    env.DB.prepare("SELECT id, title, slug, summary, content, status, ai_generated, seo_title, seo_description, seo_keywords FROM articles WHERE status='published' ORDER BY published_at DESC, id DESC").all(),
    env.DB.prepare(`SELECT k.id, k.keyword, k.city_id, k.service_id, k.opportunity_score, k.landing_slug,
           ci.name AS city_name, ci.slug AS city_slug, ci.is_active AS city_active,
           s.name AS service_name, s.slug AS service_slug, s.is_active AS service_active,
           s.seo_description AS service_seo_description, s.seo_keywords AS service_seo_keywords
         FROM keywords k
         LEFT JOIN cities ci ON ci.id=k.city_id
         LEFT JOIN services s ON s.id=k.service_id
         WHERE k.city_id IS NOT NULL AND k.service_id IS NOT NULL
         ORDER BY k.opportunity_score DESC, k.id ASC`).all(),
  ])

  const settings: Record<string, string> = {}
  for (const row of (settingsRows.results as any[])) settings[String(row.key)] = String(row.value ?? '')
  const pageSettings = getPageSettings(settings)
  const aiStore = getAiContentStore(settings)

  const directAi = new Map<string, any>()
  const aiRows = (await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'ai_page:%'").all()).results as any[]
  for (const row of aiRows) {
    try {
      const parsed = JSON.parse(String(row.value || ''))
      if (parsed && typeof parsed.content === 'string') directAi.set(String(row.key), parsed)
    } catch {}
  }
  const getAi = (group: 'cities' | 'services' | 'landing', key: string) => {
    const direct = directAi.get(aiContentSettingKey(group, key))
    return direct || aiStore[group]?.[key]
  }

  const pages: SeoAuditView[] = []
  const add = (page: SeoAuditPage, dbId?: number) => pages.push({ ...page, dbId, audit: auditSeoPage(page) })

  const home = pageSettings.home
  const articlesPage = pageSettings.articles
  const cityList = pageSettings.cities
  const serviceList = pageSettings.services
  const about = pageSettings.about
  const contact = pageSettings.contact
  const activeServices = (serviceRows.results as any[]).filter((row) => Number(row.is_active || 0) === 1)
  const activeCities = (cityRows.results as any[]).filter((row) => Number(row.is_active || 0) === 1)
  const publishedArticles = (articleRows.results as any[]).filter((row) => String(row.status || '') === 'published')
  const globalContacts = getContactMethods(settings)

  // 页面管理正文是可选的补充内容；SEO 审核同时读取该页面真实展示的服务/城市/资讯/固定模块，
  // 避免“正文留空”就被误判成没有页面价值。
  const visibleManagedContent: Record<string, string> = {
    home: [
      settings.site_description || '',
      ...activeServices.slice(0, 8).map((row) => [row.name, row.summary].filter(Boolean).join('：')),
      ...activeCities.slice(0, 24).map((row) => [row.name, row.province].filter(Boolean).join(' ')),
      ...publishedArticles.slice(0, 6).map((row) => [row.title, row.summary].filter(Boolean).join('：')),
      '服务项目、服务城市、新闻资讯、需求提交入口',
    ].filter(Boolean).join('；'),
    services: activeServices.map((row) => [row.name, row.summary].filter(Boolean).join('：')).join('；'),
    cities: activeCities.slice(0, 100).map((row) => [row.name, row.province].filter(Boolean).join(' ')).join('；'),
    articles: publishedArticles.map((row) => [row.title, row.summary].filter(Boolean).join('：')).join('；'),
    about: '专业团队；服务范围；执行流程；需求提交入口',
    contact: [
      globalContacts.phones.length ? '电话：' + globalContacts.phones.join('、') : '',
      globalContacts.wechats.length ? '微信：' + globalContacts.wechats.join('、') : '',
      globalContacts.qqs.length ? 'QQ：' + globalContacts.qqs.join('、') : '',
      '需求提交表单：姓名、电话、城市、服务项目、需求说明',
    ].filter(Boolean).join('；'),
  }

  const managedPages = [
    { page: home, key: 'home', fallbackTitle: '首页', fallbackDesc: settings.site_description || '网站首页内容与服务信息', url: '/' },
    { page: articlesPage, key: 'articles', fallbackTitle: '新闻资讯', fallbackDesc: '行业资讯、实用指南与服务信息', url: '/article' },
    { page: cityList, key: 'cities', fallbackTitle: '服务城市', fallbackDesc: '城市与地区服务信息', url: '/city' },
    { page: serviceList, key: 'services', fallbackTitle: '服务项目', fallbackDesc: '服务范围、执行流程与相关信息', url: '/service' },
    { page: about, key: 'about', fallbackTitle: '关于我们', fallbackDesc: settings.site_description || '站点介绍、服务范围与工作方式', url: '/about' },
    { page: contact, key: 'contact', fallbackTitle: '联系我们', fallbackDesc: '提交需求与联系方式', url: '/contact' },
  ] as const

  for (const item of managedPages) {
    const p: any = item.page
    const title = p.mode === 'internal'
      ? (item.key === 'home' ? (settings.site_title || p.titleZh || item.fallbackTitle) : (p.titleZh || item.fallbackTitle))
      : (p.labelZh || item.fallbackTitle)
    const description = p.mode === 'internal'
      ? (item.key === 'home' ? (settings.site_description || p.subtitleZh || item.fallbackDesc) : (p.subtitleZh || item.fallbackDesc))
      : item.fallbackDesc
    add({
      type: item.key === 'home' ? 'home' : 'list',
      key: item.key,
      title,
      url: item.url,
      description,
      content: p.mode === 'internal'
        ? [String(p.contentZh || ''), visibleManagedContent[item.key] || ''].filter(Boolean).join('\n')
        : '',
      keywords: String(p.seoKeywordsZh || (item.key === 'home' ? settings.site_keywords || '' : p.labelZh || item.fallbackTitle)),
      indexable: p.mode === 'internal',
      sitemap: p.mode === 'internal',
      active: p.mode === 'internal',
      aiGenerated: p.aiGenerated === true || (item.key === 'home' && settings.site_seo_ai_generated === '1'),
    })
  }

  for (const row of (cityRows.results as any[])) {
    const ai = getAi('cities', String(row.slug || ''))
    add({
      type: 'city',
      key: String(row.slug || row.id),
      title: String(row.seo_title || row.name + (settings.site_topic || settings.site_industry || '服务信息')),
      url: '/city/' + String(row.slug || ''),
      description: String(row.seo_description || ''),
      content: String(ai?.content || ''),
      keywords: String(row.seo_keywords || ''),
      indexable: Number(row.is_active || 0) === 1,
      sitemap: Number(row.is_active || 0) === 1,
      active: Number(row.is_active || 0) === 1,
      aiGenerated: !!ai,
    }, Number(row.id || 0))
  }

  const serviceLinks = await loadServiceExternalLinks(env)
  for (const row of (serviceRows.results as any[])) {
    const ai = getAi('services', String(row.slug || ''))
    const external = !!serviceLinks[String(row.slug || '')]
    add({
      type: 'service',
      key: String(row.slug || row.id),
      title: String(row.seo_title || row.name + '服务'),
      url: '/service/' + String(row.slug || ''),
      description: String(row.seo_description || row.summary || ''),
      content: String(ai?.content || ''),
      keywords: String(row.seo_keywords || row.name || ''),
      indexable: Number(row.is_active || 0) === 1 && !external,
      sitemap: Number(row.is_active || 0) === 1 && !external,
      active: Number(row.is_active || 0) === 1 && !external,
      aiGenerated: !!ai,
    }, Number(row.id || 0))
  }

  for (const row of (articleRows.results as any[])) {
    add({
      type: 'article',
      key: String(row.slug || row.id),
      title: String(row.seo_title || row.title || ''),
      url: '/article/' + String(row.slug || ''),
      description: String(row.seo_description || row.summary || ''),
      content: String(row.content || ''),
      keywords: String(row.seo_keywords || ''),
      indexable: row.status === 'published',
      sitemap: row.status === 'published',
      active: row.status === 'published',
      aiGenerated: Number(row.ai_generated || 0) === 1,
    }, Number(row.id || 0))
  }

  for (const row of (keywordRows.results as any[])) {
    const cityActive = Number(row.city_active || 0) === 1
    const serviceActive = Number(row.service_active || 0) === 1
    const opportunity = Number(row.opportunity_score || 0)
    const landingKey = String(row.landing_slug || (String(row.city_slug || '') + '-' + String(row.service_slug || '')))
    const ai = getAi('landing', landingKey)
    add({
      type: 'landing',
      key: String(row.id),
      title: String(ai?.title || row.city_name + row.service_name),
      url: '/city/' + String(row.city_slug || '') + '/' + String(row.service_slug || ''),
      description: String(ai?.summary || row.service_seo_description || ''),
      content: String(ai?.content || ''),
      keywords: String(row.keyword || '') + ',' + String(row.service_seo_keywords || ''),
      indexable: cityActive && serviceActive && opportunity >= MIN_INDEXABLE_OPPORTUNITY_SCORE,
      sitemap: cityActive && serviceActive && opportunity >= MIN_INDEXABLE_OPPORTUNITY_SCORE,
      active: cityActive && serviceActive && opportunity >= MIN_INDEXABLE_OPPORTUNITY_SCORE,
      aiGenerated: !!ai,
      opportunityScore: opportunity,
    }, Number(row.id || 0))
  }

  const summary = summarizeSeoAudit(pages.map((p) => p.audit))
  return { pages, summary }
}

async function syncPageSeoKeywords(env: Bindings): Promise<{ cities: number; services: number; articles: number }> {
  const globalSeoKeywords = await getGlobalSeoKeywords(env)
  const profileSettings = await readSettingsMap(env)
  const siteProfile = getSiteProfile(profileSettings, env.SITE_NAME || '')
  const [cityRows, serviceRows, articleRows, matrixRows] = await Promise.all([
    env.DB.prepare('SELECT id, name FROM cities WHERE is_active=1 ORDER BY sort_order, id').all(),
    env.DB.prepare('SELECT id, name FROM services WHERE is_active=1 ORDER BY sort_order, id').all(),
    env.DB.prepare("SELECT id, title, summary, content FROM articles WHERE status='published' ORDER BY id").all(),
    env.DB.prepare('SELECT city_id, service_id, keyword FROM keywords WHERE city_id IS NOT NULL AND service_id IS NOT NULL AND COALESCE(opportunity_score,0)>0 ORDER BY opportunity_score DESC, search_volume DESC, id ASC').all(),
  ])

  const cityKeywords = new Map<number, string[]>()
  const serviceKeywords = new Map<number, string[]>()
  const cityNameById = new Map<number, string>((cityRows.results as any[]).map((row) => [Number(row.id || 0), String(row.name || '').trim()]))
  for (const row of matrixRows.results as any[]) {
    const keyword = String(row.keyword || '').trim()
    if (!keyword) continue
    const cityId = Number(row.city_id || 0)
    const serviceId = Number(row.service_id || 0)
    if (cityId) {
      const list = cityKeywords.get(cityId) || []
      if (list.length < 5) cityKeywords.set(cityId, normalizeSeoKeywords([...list, keyword], 5))
    }
    if (serviceId) {
      const cityName = cityNameById.get(cityId) || ''
      const serviceTopic = cityName && keyword.startsWith(cityName) ? keyword.slice(cityName.length).trim() : keyword
      const list = serviceKeywords.get(serviceId) || []
      if (list.length < 5) serviceKeywords.set(serviceId, normalizeSeoKeywords([...list, serviceTopic], 5))
    }
  }

  const statements: any[] = []
  for (const row of cityRows.results as any[]) {
    const id = Number(row.id || 0)
    const name = String(row.name || '').trim()
    const fallback = [name + siteProfile.topic, name + '服务', name + '流程', name + '注意事项']
    const keywords = normalizeSeoKeywords([...(cityKeywords.get(id) || []), ...fallback], 5)
    statements.push(env.DB.prepare('UPDATE cities SET seo_keywords=? WHERE id=?').bind(keywords.join(','), id))
  }

  for (const row of serviceRows.results as any[]) {
    const id = Number(row.id || 0)
    const name = String(row.name || '').trim()
    const fallback = [name, name + '服务', name + '流程', name + '注意事项']
    const keywords = normalizeSeoKeywords([...(serviceKeywords.get(id) || []), ...fallback], 5)
    statements.push(env.DB.prepare('UPDATE services SET seo_keywords=? WHERE id=?').bind(keywords.join(','), id))
  }

  for (const row of articleRows.results as any[]) {
    const keywords = buildArticleSeoKeywords(String(row.title || ''), String(row.summary || ''), String(row.content || ''), globalSeoKeywords, siteProfile).slice(0, 5)
    statements.push(env.DB.prepare('UPDATE articles SET seo_keywords=? WHERE id=?').bind(keywords.join(','), row.id))
  }

  for (let i = 0; i < statements.length; i += 50) {
    await env.DB.batch(statements.slice(i, i + 50))
  }

  return {
    cities: cityRows.results.length,
    services: serviceRows.results.length,
    articles: articleRows.results.length,
  }
}

adminRoutes.get('/cities', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT * FROM cities ORDER BY sort_order, id').all()).results as any[]
  const settings = await readSettingsMap(c.env)
  const aiRows = (await c.env.DB.prepare("SELECT key FROM settings WHERE key LIKE 'ai_page:cities:%'").all()).results as any[]
  const aiKeys = new Set(aiRows.map((row) => String(row.key).slice('ai_page:cities:'.length)))
  const legacyStore = getAiContentStore(settings)
  for (const row of rows) row.ai_content_exists = aiKeys.has(String(row.slug)) || !!legacyStore.cities[String(row.slug)]?.content
  // 待生成城市永远排在前面；同一状态内保持原有 sort_order / id 顺序。
  rows.sort((a, b) => Number(Boolean(a.ai_content_exists)) - Number(Boolean(b.ai_content_exists)) || Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id || 0) - Number(b.id || 0))
  const bulkError = String(c.req.query('bulk_error') || '').trim().slice(0, 220)
  const aiError = String(c.req.query('ai_error') || '').trim().slice(0, 220)
  const message = c.req.query('duplicate') === '1'
    ? '该城市已在城市库中，系统已自动去重。'
    : c.req.query('bulk_deleted')
      ? `已批量删除 ${Math.max(0, Number(c.req.query('bulk_deleted')) || 0)} 个城市；已生成和待生成内容、启用和停用城市均按同一规则清理。`
      : c.req.query('ai_generated') === '1'
        ? 'AI城市内容已生成并保存，继续留在城市列表即可查看“已生成”状态。'
        : bulkError
          ? '批量删除失败：' + bulkError
          : aiError
            ? 'AI城市内容生成失败：' + aiError
            : ''
  return c.html(renderCitiesList(rows, CHINA_CITY_CATALOG, message))
})


adminRoutes.post('/cities/add', async (c) => {
  const b = await c.req.parseBody()
  let province = String(b.province || '').trim()
  let name = String(b.name || '').trim()
  let slug = String(b.slug || '').trim().toLowerCase()
  let tier = String(b.tier || '二线')
  if (b.catalog_key) {
    const parts = String(b.catalog_key).split('|')
    if (parts.length === 4) [province, name, slug, tier] = parts
  }
  if (!province || !name || !slug || !/^[a-z0-9-]+$/.test(slug)) return c.text('城市信息不完整或 slug 格式错误', 400)
  const existingCity = await c.env.DB.prepare('SELECT id FROM cities WHERE name=? OR slug=? LIMIT 1').bind(name, slug).first()
  if (existingCity) return c.redirect('/admin/cities?duplicate=1')
  try {
    await c.env.DB.prepare('INSERT INTO cities (name, slug, province, tier, is_active, sort_order) SELECT ?, ?, ?, ?, 1, COALESCE(MAX(sort_order),0)+1 FROM cities')
      .bind(name, slug, province, tier).run()
  } catch (e) {
    console.error('city insert failed', e)
    return c.redirect('/admin/cities?duplicate=1')
  }
  // 新城市启用后自动补齐 SEO；AI 正文放到 waitUntil，避免添加城市时同步占用过多 CPU。
  const globalSeoKeywords = await getGlobalSeoKeywords(c.env)
  const seo = autoCitySeo({ name }, c.env.SITE_NAME || '网站内容平台', globalSeoKeywords)
  await c.env.DB.prepare(`UPDATE cities SET seo_title=?, seo_description=?, seo_keywords=? WHERE slug=? AND (TRIM(COALESCE(seo_title,''))='' OR TRIM(COALESCE(seo_description,''))='' OR TRIM(COALESCE(seo_keywords,''))='')`)
    .bind(seo.seo_title, seo.seo_description, seo.seo_keywords, slug).run()
  const settings = await readSettingsMap(c.env)
  c.executionCtx.waitUntil((async () => {
    if (getAiContentEntry(settings, 'cities', slug)?.content) return
    try {
      const createdCity = await c.env.DB.prepare('SELECT id FROM cities WHERE slug=?').bind(slug).first() as any
      const keywords = createdCity?.id ? await getCityAiKeywords(c.env, Number(createdCity.id), name, globalSeoKeywords) : []
      const ai = await generateAiPageContent(c.env, { type: 'city', city: name, keywords })
      if (ai) await saveSetting(c.env, aiContentSettingKey('cities', slug), JSON.stringify({ ...ai, updatedAt: new Date().toISOString() }))
    } catch (e) {
      console.error('new city AI content generation failed', e)
    }
  })())
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/cities')
})

adminRoutes.get('/cities/:id/edit', async (c) => {
  const city = await c.env.DB.prepare('SELECT * FROM cities WHERE id=?').bind(c.req.param('id')).first() as any
  if (!city) return c.notFound()
  const settings = await readSettingsMap(c.env)
  const images = getImageStore(settings)
  const aiContent = await getAiContentEntryDb(c.env, settings, 'cities', city.slug)
  const globalSeoKeywords = settings.site_keywords || ''
  const pageContact = getPageContact(settings, 'city:' + city.slug, getContactMethods(settings))
  return c.html(renderCityForm(city, aiContent?.content || '', '', images.cities[city.slug], globalSeoKeywords, pageContact))
})

adminRoutes.post('/cities/:id/edit', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.parseBody()
  const active = b.is_active ? 1 : 0
  const current = await c.env.DB.prepare('SELECT * FROM cities WHERE id=?').bind(id).first() as any
  if (!current) return c.notFound()
  const settings = await readSettingsMap(c.env)
  const globalSeoKeywords = settings.site_keywords || ''
  const generated = active ? autoCitySeo({ name: current.name }, c.env.SITE_NAME || '网站内容平台', globalSeoKeywords) : null
  const seoTitle = generated?.seo_title || ''
  const seoDescription = generated?.seo_description || ''
  const seoKeywords = generated?.seo_keywords || ''
  await c.env.DB.prepare('UPDATE cities SET tier=?, is_active=?, seo_title=?, seo_description=?, seo_keywords=? WHERE id=?')
    .bind(b.tier, active, seoTitle, seoDescription, seoKeywords, id).run()
  const existingContent = getAiContentEntry(settings, 'cities', current.slug)
  const pageContent = String(b.page_content || '').trim().slice(0, 16000)
  if (pageContent) await saveSetting(c.env, aiContentSettingKey('cities', current.slug), JSON.stringify({ ...(existingContent || {}), title: current.name + (settings.site_topic || settings.site_industry || '服务信息'), summary: '本地化服务信息', content: pageContent, updatedAt: new Date().toISOString() }))
  else if (active && !existingContent?.content) {
    const keywords = await getCityAiKeywords(c.env, Number(current.id), String(current.name), globalSeoKeywords)
    const ai = await generateAiPageContent(c.env, { type: 'city', city: current.name, keywords })
    if (ai) await saveSetting(c.env, aiContentSettingKey('cities', current.slug), JSON.stringify({ ...ai, updatedAt: new Date().toISOString() }))
  }
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/cities')
})

adminRoutes.post('/cities/:id/auto-seo', async (c) => {
  const id = c.req.param('id')
  const city = await c.env.DB.prepare('SELECT * FROM cities WHERE id=?').bind(id).first() as any
  if (!city) return c.notFound()
  const seo = autoCitySeo({ name: city.name }, c.env.SITE_NAME || '网站内容平台', await getGlobalSeoKeywords(c.env))
  await c.env.DB.prepare('UPDATE cities SET seo_title=?, seo_description=?, seo_keywords=? WHERE id=?')
    .bind(seo.seo_title, seo.seo_description, seo.seo_keywords, id).run()
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/cities/' + id + '/edit')
})

adminRoutes.post('/cities/bulk-delete', async (c) => {
  // 多选 checkbox 使用同名 city_ids；Hono 默认 parseBody 只取一个值，必须开启 all 才能拿到完整数组。
  const body = await c.req.parseBody({ all: true })
  const rawIds = body.city_ids
  const values = Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : []
  const ids = Array.from(new Set(values
    .map((value) => Number(String(value)))
    .filter((id) => Number.isInteger(id) && id > 0)
  )).slice(0, 100)

  if (!ids.length) return c.redirect('/admin/cities?bulk_deleted=0')

  const placeholders = ids.map(() => '?').join(',')
  const cityRows = (await c.env.DB
    .prepare(`SELECT id, slug FROM cities WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all()).results as any[]
  if (!cityRows.length) return c.redirect('/admin/cities?bulk_deleted=0')

  const settings = await readSettingsMap(c.env)
  const aiStore = getAiContentStore(settings)
  const imageStore = getImageStore(settings)
  const slugs: string[] = []
  const pageContactKeys: string[] = []
  const oldImages: any[] = []

  for (const city of cityRows) {
    const slug = String(city.slug || '').trim()
    if (!slug) continue
    slugs.push(slug)
    pageContactKeys.push('city:' + slug)
    const oldImage = removeImage(imageStore, 'cities', slug)
    if (oldImage) oldImages.push(oldImage)
    delete aiStore.cities[slug]
  }

  const statements: any[] = []
  for (const id of cityRows.map((row) => Number(row.id))) {
    // 城市删除前先解除人工文章的城市关联，避免 D1 外键阻止删除；AI 生成文章则随城市一起彻底删除。
    statements.push(
      c.env.DB.prepare('UPDATE articles SET city_id=NULL WHERE city_id=? AND COALESCE(ai_generated, 0)=0').bind(id),
      c.env.DB.prepare('DELETE FROM social_posts WHERE article_id IN (SELECT id FROM articles WHERE city_id=? AND ai_generated=1)').bind(id),
      c.env.DB.prepare('DELETE FROM review_logs WHERE article_id IN (SELECT id FROM articles WHERE city_id=? AND ai_generated=1)').bind(id),
      c.env.DB.prepare('DELETE FROM keywords WHERE city_id=?').bind(id),
      c.env.DB.prepare('DELETE FROM articles WHERE city_id=? AND ai_generated=1').bind(id),
      c.env.DB.prepare('DELETE FROM cities WHERE id=?').bind(id),
    )
  }
  for (let offset = 0; offset < slugs.length; offset += 25) {
    const chunk = slugs.slice(offset, offset + 25)
    for (const slug of chunk) {
      statements.push(c.env.DB.prepare('DELETE FROM settings WHERE key=?').bind(aiContentSettingKey('cities', slug)))
    }
  }

  try {
    for (let offset = 0; offset < statements.length; offset += 100) {
      await c.env.DB.batch(statements.slice(offset, offset + 100))
    }

    await removePageContact(c.env, pageContactKeys)
    await saveSetting(c.env, 'ai_page_content_json', saveAiContentStore(aiStore))
    await saveImageStoreSetting(c.env, imageStore)
  } catch (e) {
    console.error('bulk city delete failed', e)
    const detail = String((e as any)?.message || '').slice(0, 180)
    return c.redirect('/admin/cities?bulk_error=' + encodeURIComponent(detail || '数据库删除失败，请查看 Worker 日志'))
  }

  // D1/UI 状态立即更新；历史 R2 对象放到 waitUntil，防止批量删除大城市集时触发 Worker CPU 超时。
  c.executionCtx.waitUntil((async () => {
    for (const oldImage of oldImages) {
      try {
        await deletePageImage(c.env, oldImage)
        if (oldImage?.key) await purgeCacheTags(c.executionCtx, [mediaCacheTag(oldImage.key)])
      } catch (e) {
        console.warn('bulk city image cleanup failed', e)
      }
    }
    for (const slug of slugs) {
      let cursor = ''
      for (let page = 0; page < 10; page++) {
        try {
          const batch = await deleteR2PrefixBatch(c.env, 'media/pages/city/' + slug + '/', cursor, 25)
          if (batch.complete || !batch.nextCursor) break
          cursor = batch.nextCursor
        } catch (e) {
          console.warn('bulk city R2 prefix cleanup failed', slug, e)
          break
        }
      }
    }
    await purgeCacheAll(c.executionCtx)
  })())

  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/cities?bulk_deleted=' + cityRows.length)
})

adminRoutes.post('/cities/:id/delete', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  const city = await c.env.DB.prepare('SELECT slug FROM cities WHERE id=?').bind(id).first() as any
  if (!city) return c.notFound()
  const slug = String(city.slug || '').trim()

  const settings = await readSettingsMap(c.env)
  const imageStore = getImageStore(settings)
  const oldImage = removeImage(imageStore, 'cities', slug)
  const aiStore = getAiContentStore(settings)
  delete aiStore.cities[slug]

  await c.env.DB.batch([
    // 先解除人工文章的城市关联；AI 文章与城市一起删除，避免 D1 外键约束导致城市删不掉。
    c.env.DB.prepare('UPDATE articles SET city_id=NULL WHERE city_id=? AND COALESCE(ai_generated, 0)=0').bind(id),
    c.env.DB.prepare('DELETE FROM social_posts WHERE article_id IN (SELECT id FROM articles WHERE city_id=? AND ai_generated=1)').bind(id),
    c.env.DB.prepare('DELETE FROM review_logs WHERE article_id IN (SELECT id FROM articles WHERE city_id=? AND ai_generated=1)').bind(id),
    c.env.DB.prepare('DELETE FROM keywords WHERE city_id=?').bind(id),
    c.env.DB.prepare('DELETE FROM articles WHERE city_id=? AND ai_generated=1').bind(id),
    c.env.DB.prepare('DELETE FROM cities WHERE id=?').bind(id),
    c.env.DB.prepare('DELETE FROM settings WHERE key=?').bind(aiContentSettingKey('cities', slug)),
  ])
  await removePageContact(c.env, ['city:' + slug])
  await saveSetting(c.env, 'ai_page_content_json', saveAiContentStore(aiStore))
  await saveImageStoreSetting(c.env, imageStore)
  await deletePageImage(c.env, oldImage)

  // 删除同城市历史残留页面图片；单次最多 10 页 × 25 对象，超过部分交给全量资源清理，避免 1101/1102。
  let cursor = ''
  for (let page = 0; page < 10; page++) {
    const batch = await deleteR2PrefixBatch(c.env, 'media/pages/city/' + slug + '/', cursor, 25)
    if (batch.complete) break
    cursor = batch.nextCursor
    if (!cursor) break
  }

  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/cities')
})

adminRoutes.post('/cities/:id/ai-content', async (c) => {
  const id = c.req.param('id')
  const city = await c.env.DB.prepare('SELECT * FROM cities WHERE id=?').bind(id).first() as any
  if (!city) return c.notFound()

  const routeStatus = await getAiRouteStatus(c.env)
  if (!routeStatus.ok) {
    return c.text(routeStatus.message, 503)
  }
  const aiSettings = routeStatus.settings

  try {
    const keywords = await getCityAiKeywords(c.env, Number(city.id), String(city.name), await getGlobalSeoKeywords(c.env))
    const ai = await generateAiPageContent(c.env, { type: 'city', city: city.name, keywords }, aiSettings)
      if (!ai) {
      return c.redirect('/admin/cities?ai_error=' + encodeURIComponent('Workers AI 未返回可保存的城市内容，请检查 AI设置和城市页面提示词。'))
    }
    await saveSetting(c.env, aiContentSettingKey('cities', city.slug), JSON.stringify({ ...ai, updatedAt: new Date().toISOString() }))
  } catch (e) {
    console.error('AI city content generation failed', e)
    return c.redirect('/admin/cities?ai_error=' + encodeURIComponent(errorMessage(e, 'AI城市内容生成失败').slice(0, 220)))
  }
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/cities?ai_generated=1')
})

adminRoutes.post('/cities/:id/content/delete', async (c) => {
  const id = c.req.param('id')
  const city = await c.env.DB.prepare('SELECT slug FROM cities WHERE id=?').bind(id).first() as any
  if (!city) return c.notFound()
  const settings = await readSettingsMap(c.env)
  const store = getAiContentStore(settings)
  delete store.cities[city.slug]
  await c.env.DB.prepare('DELETE FROM settings WHERE key=?').bind(aiContentSettingKey('cities', city.slug)).run()
  await saveSetting(c.env, 'ai_page_content_json', saveAiContentStore(store))
  const images = getImageStore(settings)
  const oldImage = removeImage(images, 'cities', city.slug)
  await saveImageStoreSetting(c.env, images)
  await deletePageImage(c.env, oldImage)
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/cities/' + id + '/edit')
})


adminRoutes.get('/subprojects', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT s.*, COUNT(si.id) AS item_count FROM subprojects s LEFT JOIN subproject_items si ON si.subproject_id=s.id GROUP BY s.id ORDER BY s.section, s.sort_order, s.id').all()).results as any[]
  const message = c.req.query('saved') === '1'
    ? '子项目已保存。'
    : c.req.query('deleted') === '1'
      ? '子项目已删除；关联服务、文章、城市不会被删除。'
      : ''
  return c.html(renderSubprojectsList(rows, message))
})

adminRoutes.get('/subprojects/new', async (c) => {
  return c.html(renderSubprojectForm({}))
})

adminRoutes.post('/subprojects/new', async (c) => {
  const b = await c.req.parseBody({ all: true })
  const section = String(b.section || '').trim()
  const meta = SUBPROJECT_SECTIONS.find((item) => item.key === section)
  const name = String(b.name || '').trim().slice(0, 120)
  const labelZh = String(b.label_zh || '').trim().slice(0, 120)
  const labelEn = String(b.label_en || '').trim().slice(0, 120)
  const slug = normalizeSubprojectSlug(b.slug)
  if (!meta || !name || !labelZh || !slug) {
    return c.html(renderSubprojectForm({ error: '栏目、名称、中文标签和 URL Slug 都必须填写。' }), 400)
  }
  const duplicate = await c.env.DB.prepare('SELECT id FROM subprojects WHERE section=? AND (slug=? OR name=?) LIMIT 1').bind(section, slug, name).first()
  if (duplicate) {
    return c.html(renderSubprojectForm({ error: '同一栏目下已有相同名称或 Slug，请修改后再保存。' }), 409)
  }

  try {
    const inserted = await c.env.DB.prepare(
      "INSERT INTO subprojects (section,name,slug,label_zh,label_en,title_zh,title_en,subtitle_zh,subtitle_en,content_zh,content_en,seo_title_zh,seo_title_en,seo_description_zh,seo_description_en,seo_keywords_zh,seo_keywords_en,layout,is_active,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id"
    ).bind(
      section, name, slug, labelZh, labelEn,
      String(b.title_zh || '').trim().slice(0, 180), String(b.title_en || '').trim().slice(0, 180),
      String(b.subtitle_zh || '').trim().slice(0, 300), String(b.subtitle_en || '').trim().slice(0, 300),
      String(b.content_zh || '').trim().slice(0, 16000), String(b.content_en || '').trim().slice(0, 16000),
      String(b.seo_title_zh || '').trim().slice(0, 180), String(b.seo_title_en || '').trim().slice(0, 180),
      String(b.seo_description_zh || '').trim().slice(0, 320), String(b.seo_description_en || '').trim().slice(0, 320),
      String(b.seo_keywords_zh || '').trim().slice(0, 300), String(b.seo_keywords_en || '').trim().slice(0, 300),
      normalizeSubprojectLayout(b.layout), b.is_active ? 1 : 0, Number(b.sort_order || 0) || 0
    ).first() as any
    const id = Number(inserted?.id || 0)
    if (!id) throw new Error('子项目创建失败')
    const itemIds = parseSubprojectItems(b.item_ids)
    if (itemIds.length) {
      await c.env.DB.batch(itemIds.map((itemId, idx) =>
        c.env.DB.prepare('INSERT OR IGNORE INTO subproject_items (subproject_id,item_type,item_id,sort_order) VALUES (?,?,?,?)')
          .bind(id, meta.itemType, itemId, idx)
      ))
    }
  } catch (e) {
    console.error('create subproject failed', e)
    return c.html(renderSubprojectForm({ error: errorMessage(e, '子项目创建失败').slice(0, 220) }), 500)
  }
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/subprojects?saved=1')
})

adminRoutes.get('/subprojects/:id/edit', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.notFound()
  const p = await c.env.DB.prepare('SELECT * FROM subprojects WHERE id=?').bind(id).first() as any
  if (!p) return c.notFound()
  const meta = SUBPROJECT_SECTIONS.find((item) => item.key === String(p.section))
  if (!meta) return c.notFound()
  const itemTable = meta.itemType === 'service' ? 'services' : meta.itemType === 'city' ? 'cities' : 'articles'
  const orderColumn = meta.itemType === 'article' ? 'created_at' : 'sort_order'
  const items = (await c.env.DB.prepare('SELECT id, ' + (meta.itemType === 'article' ? 'title AS name' : 'name') + ', slug FROM ' + itemTable + ' ORDER BY ' + orderColumn + ' DESC LIMIT 200').all()).results as any[]
  const selected = (await c.env.DB.prepare('SELECT item_id FROM subproject_items WHERE subproject_id=? AND item_type=? ORDER BY sort_order,id').bind(id, meta.itemType).all()).results as any[]
  return c.html(renderSubprojectForm({ subproject: p, items, selectedIds: selected.map((x) => Number(x.item_id)), error: String(c.req.query('error') || '').trim() }))
})

adminRoutes.post('/subprojects/:id/edit', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.notFound()
  const existing = await c.env.DB.prepare('SELECT * FROM subprojects WHERE id=?').bind(id).first() as any
  if (!existing) return c.notFound()
  const meta = SUBPROJECT_SECTIONS.find((item) => item.key === String(existing.section))
  if (!meta) return c.notFound()
  const b = await c.req.parseBody({ all: true })
  const name = String(b.name || '').trim().slice(0, 120)
  const labelZh = String(b.label_zh || '').trim().slice(0, 120)
  const labelEn = String(b.label_en || '').trim().slice(0, 120)
  const slug = normalizeSubprojectSlug(b.slug)
  if (!name || !labelZh || !slug) {
    return c.redirect('/admin/subprojects/' + id + '/edit?error=' + encodeURIComponent('名称、中文标签和 URL Slug 都必须填写。'))
  }
  const duplicate = await c.env.DB.prepare('SELECT id FROM subprojects WHERE section=? AND id<>? AND (slug=? OR name=?) LIMIT 1').bind(existing.section, id, slug, name).first()
  if (duplicate) {
    return c.redirect('/admin/subprojects/' + id + '/edit?error=' + encodeURIComponent('同一栏目下已有相同名称或 Slug。'))
  }
  await c.env.DB.prepare(
    "UPDATE subprojects SET name=?,slug=?,label_zh=?,label_en=?,title_zh=?,title_en=?,subtitle_zh=?,subtitle_en=?,content_zh=?,content_en=?,seo_title_zh=?,seo_title_en=?,seo_description_zh=?,seo_description_en=?,seo_keywords_zh=?,seo_keywords_en=?,layout=?,is_active=?,sort_order=?,updated_at=datetime('now') WHERE id=?"
  ).bind(
    name, slug, labelZh, labelEn,
    String(b.title_zh || '').trim().slice(0, 180), String(b.title_en || '').trim().slice(0, 180),
    String(b.subtitle_zh || '').trim().slice(0, 300), String(b.subtitle_en || '').trim().slice(0, 300),
    String(b.content_zh || '').trim().slice(0, 16000), String(b.content_en || '').trim().slice(0, 16000),
    String(b.seo_title_zh || '').trim().slice(0, 180), String(b.seo_title_en || '').trim().slice(0, 180),
    String(b.seo_description_zh || '').trim().slice(0, 320), String(b.seo_description_en || '').trim().slice(0, 320),
    String(b.seo_keywords_zh || '').trim().slice(0, 300), String(b.seo_keywords_en || '').trim().slice(0, 300),
    normalizeSubprojectLayout(b.layout), b.is_active ? 1 : 0, Number(b.sort_order || 0) || 0, id
  ).run()
  const itemIds = parseSubprojectItems(b.item_ids)
  await c.env.DB.prepare('DELETE FROM subproject_items WHERE subproject_id=?').bind(id).run()
  if (itemIds.length) {
    await c.env.DB.batch(itemIds.map((itemId, idx) =>
      c.env.DB.prepare('INSERT OR IGNORE INTO subproject_items (subproject_id,item_type,item_id,sort_order) VALUES (?,?,?,?)')
        .bind(id, meta.itemType, itemId, idx)
    ))
  }
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/subprojects?saved=1')
})

adminRoutes.post('/subprojects/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.notFound()
  const row = await c.env.DB.prepare('SELECT id FROM subprojects WHERE id=?').bind(id).first()
  if (!row) return c.notFound()
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM subproject_items WHERE subproject_id=?').bind(id),
    c.env.DB.prepare('DELETE FROM subprojects WHERE id=?').bind(id),
  ])
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/subprojects?deleted=1')
})

// ---- 服务管理 ----
adminRoutes.get('/services/new', async (c) => {
  const settings = await readSettingsMap(c.env)
  const globalSeoKeywords = settings.site_keywords || ''
  return c.html(renderServiceForm({ name: '', slug: '', summary: '', demand_weight: 50, is_active: 1, sort_order: 0 }, '', '', undefined, globalSeoKeywords))
})

adminRoutes.post('/services/new', async (c) => {
  const b = await c.req.parseBody()
  const name = String(b.name || '').trim().slice(0, 100)
  const slug = String(b.slug || '').trim().toLowerCase().slice(0, 120)
  const summary = String(b.summary || '').trim().slice(0, 500)
  const demandWeight = Math.max(0, Math.min(100, parseInt(String(b.demand_weight || '50'), 10) || 50))
  const isActive = b.is_active ? 1 : 0
  if (!name) return c.text('请填写服务名称', 400)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return c.text('URL slug 只能使用小写字母、数字和短横线，例如 dai-li-ji-zhang', 400)
  }

  const exists = await c.env.DB.prepare('SELECT id FROM services WHERE name=? OR slug=? LIMIT 1').bind(name, slug).first()
  if (exists) return c.text('服务名称或 URL slug 已存在，请换一个', 409)

  const settings = await readSettingsMap(c.env)
  const globalSeoKeywords = settings.site_keywords || ''
  const seo = isActive ? autoServiceSeo({ name, summary }, c.env.SITE_NAME || '网站内容平台', globalSeoKeywords) : { seo_title: '', seo_description: '', seo_keywords: '' }

  try {
    const created = await c.env.DB.prepare(
      'INSERT INTO services (name, slug, summary, is_active, sort_order, seo_title, seo_description, seo_keywords, demand_weight) VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(sort_order)+1 FROM services), 0), ?, ?, ?, ?)'
    ).bind(name, slug, summary, isActive, seo.seo_title, seo.seo_description, seo.seo_keywords, demandWeight).run()

    const id = Number(created.meta?.last_row_id || 0)
    if (!id) return c.text('服务创建失败，请稍后重试', 500)

    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    return c.redirect('/admin/services/' + id + '/edit?created=1')
  } catch (e) {
    console.error('create service failed', e)
    return c.text(errorMessage(e, '服务创建失败'), 500)
  }
})

// ---- 服务管理 ----
async function loadServiceExternalLinks(env: Bindings): Promise<Record<string, string>> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='service_external_links'").first() as any
  return getServiceExternalLinks(row?.value ? { service_external_links: String(row.value) } : {})
}

adminRoutes.get('/services/:id/edit', async (c) => {
  const service = await c.env.DB.prepare('SELECT * FROM services WHERE id=?').bind(c.req.param('id')).first() as any
  if (!service) return c.notFound()
  const links = await loadServiceExternalLinks(c.env)
  service.external_url = links[service.slug] || ''
  const settings = await readSettingsMap(c.env)
  const images = getImageStore(settings)
  const aiContent = await getAiContentEntryDb(c.env, settings, 'services', service.slug)
  const globalSeoKeywords = settings.site_keywords || ''
  const pageContact = getPageContact(settings, 'service:' + service.slug, getContactMethods(settings))
  return c.html(renderServiceForm(service, aiContent?.content || '', '', images.services[service.slug], globalSeoKeywords, pageContact))
})

adminRoutes.post('/services/:id/edit', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.parseBody()
  const active = b.is_active ? 1 : 0
  const current = await c.env.DB.prepare('SELECT * FROM services WHERE id=?').bind(id).first() as any
  if (!current) return c.notFound()
  const settings = await readSettingsMap(c.env)
  const globalSeoKeywords = settings.site_keywords || ''
  const generated = active ? autoServiceSeo({ name: current.name, summary: current.summary }, c.env.SITE_NAME || '网站内容平台', globalSeoKeywords) : null
  const seoTitle = generated?.seo_title || ''
  const seoDescription = generated?.seo_description || ''
  const seoKeywords = generated?.seo_keywords || ''
  const externalUrl = String(b.external_url || '').trim()
  if (externalUrl && !isHttpUrl(externalUrl)) return c.text('服务外站链接必须是有效的 http:// 或 https:// 地址', 400)
  await c.env.DB.prepare('UPDATE services SET demand_weight=?, is_active=?, seo_title=?, seo_description=?, seo_keywords=? WHERE id=?')
    .bind(parseInt(String(b.demand_weight || '50'), 10), active, seoTitle, seoDescription, seoKeywords, id).run()
  const links = await loadServiceExternalLinks(c.env)
  if (externalUrl) links[current.slug] = externalUrl
  else delete links[current.slug]
  await saveSetting(c.env, 'service_external_links', JSON.stringify(links))
  const existingContent = getAiContentEntry(settings, 'services', current.slug)
  const pageContent = String(b.page_content || '').trim().slice(0, 16000)
  if (pageContent) await saveSetting(c.env, aiContentSettingKey('services', current.slug), JSON.stringify({ ...(existingContent || {}), title: current.name, summary: current.summary || '', content: pageContent, updatedAt: new Date().toISOString() }))
  else if (active && !existingContent?.content) {
    const serviceKeywords = await getServiceAiKeywords(c.env, Number(current.id), String(current.name), globalSeoKeywords)
    const ai = await generateAiPageContent(c.env, { type: 'service', service: current.name, keywords: serviceKeywords })
    if (ai) await saveSetting(c.env, aiContentSettingKey('services', current.slug), JSON.stringify({ ...ai, updatedAt: new Date().toISOString() }))
  }
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/services')
})

adminRoutes.post('/services/:id/auto-seo', async (c) => {
  const id = c.req.param('id')
  const service = await c.env.DB.prepare('SELECT * FROM services WHERE id=?').bind(id).first() as any
  if (!service) return c.notFound()
  const seo = autoServiceSeo({ name: service.name, summary: service.summary }, c.env.SITE_NAME || '网站内容平台', await getGlobalSeoKeywords(c.env))
  await c.env.DB.prepare('UPDATE services SET seo_title=?, seo_description=?, seo_keywords=? WHERE id=?')
    .bind(seo.seo_title, seo.seo_description, seo.seo_keywords, id).run()
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/services/' + id + '/edit')
})

adminRoutes.post('/services/:id/delete', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  const service = await c.env.DB.prepare('SELECT slug FROM services WHERE id=?').bind(id).first() as any
  if (!service) return c.notFound()
  const slug = String(service.slug || '').trim()

  const settings = await readSettingsMap(c.env)
  const imageStore = getImageStore(settings)
  const oldImage = removeImage(imageStore, 'services', slug)
  const aiStore = getAiContentStore(settings)
  delete aiStore.services[slug]

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM keywords WHERE service_id=?').bind(id),
    c.env.DB.prepare('DELETE FROM services WHERE id=?').bind(id),
    c.env.DB.prepare('DELETE FROM settings WHERE key=?').bind(aiContentSettingKey('services', slug)),
  ])
  await removePageContact(c.env, ['service:' + slug])
  await saveSetting(c.env, 'ai_page_content_json', saveAiContentStore(aiStore))

  const links = await loadServiceExternalLinks(c.env)
  delete links[slug]
  await saveSetting(c.env, 'service_external_links', JSON.stringify(links))

  await saveImageStoreSetting(c.env, imageStore)
  await deletePageImage(c.env, oldImage)

  let cursor = ''
  for (let page = 0; page < 10; page++) {
    const batch = await deleteR2PrefixBatch(c.env, 'media/pages/service/' + slug + '/', cursor, 25)
    if (batch.complete) break
    cursor = batch.nextCursor
    if (!cursor) break
  }

  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/services')
})

adminRoutes.post('/services/:id/ai-content', async (c) => {
  const id = c.req.param('id')
  const service = await c.env.DB.prepare('SELECT * FROM services WHERE id=?').bind(id).first() as any
  if (!service) return c.notFound()
  const keywords = await getServiceAiKeywords(c.env, Number(service.id), String(service.name), await getGlobalSeoKeywords(c.env))
  const ai = await generateAiPageContent(c.env, { type: 'service', service: service.name, keywords })
  if (!ai) {
    const status = await getAiRouteStatus(c.env)
    return c.text(status.ok ? aiEmptyResultMessage('AI服务页面生成', status.settings) : status.message, 503)
  }
  await saveSetting(c.env, aiContentSettingKey('services', service.slug), JSON.stringify({ ...ai, updatedAt: new Date().toISOString() }))
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/services/' + id + '/edit')
})

adminRoutes.post('/services/:id/content/delete', async (c) => {
  const id = c.req.param('id')
  const service = await c.env.DB.prepare('SELECT slug FROM services WHERE id=?').bind(id).first() as any
  if (!service) return c.notFound()
  const settings = await readSettingsMap(c.env)
  const store = getAiContentStore(settings)
  delete store.services[service.slug]
  await c.env.DB.prepare('DELETE FROM settings WHERE key=?').bind(aiContentSettingKey('services', service.slug)).run()
  await saveSetting(c.env, 'ai_page_content_json', saveAiContentStore(store))
  const images = getImageStore(settings)
  const oldImage = removeImage(images, 'services', service.slug)
  await saveImageStoreSetting(c.env, images)
  await deletePageImage(c.env, oldImage)
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/services/' + id + '/edit')
})

adminRoutes.get('/services', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT * FROM services ORDER BY sort_order').all()).results as any[]
  const settings = await readSettingsMap(c.env)
  const imageStore = getImageStore(settings)
  const aiRows = (await c.env.DB.prepare("SELECT key FROM settings WHERE key LIKE 'ai_page:services:%'").all()).results as any[]
  const aiKeys = new Set(aiRows.map((row) => String(row.key).slice('ai_page:services:'.length)))
  const legacyStore = getAiContentStore(settings)
  return c.html(renderAdminLayout({ title: '服务管理', active: '/admin/services', body: `
    <div class="section-title">
      <h2>服务管理</h2>
      <a class="btn" href="/admin/services/new">＋ 添加服务</a>
    </div>
    <p style="color:var(--muted);font-size:13px">启用服务会自动补齐 SEO；可生成 AI 页面内容；图片直接存储在 R2。删除服务会同步删除关键词、AI 页面内容和对应 R2 图片。添加服务后可立即进入编辑页继续设置。</p>
    <table><thead><tr><th>服务</th><th>需求权重</th><th>状态</th><th>SEO</th><th>AI内容</th><th>图片</th><th>操作</th></tr></thead><tbody>
      ${rows.map((item) => `<tr>
        <td>${escapeHtml(item.name)}</td><td>${item.demand_weight}</td><td>${item.is_active ? '启用' : '停用'}</td>
        <td>${item.seo_title ? '已设置' : '自动生成'}</td>
        <td>${aiKeys.has(String(item.slug)) || !!legacyStore.services[String(item.slug)]?.content ? '已生成' : '待生成'}</td>
        <td>${imageStore.services[String(item.slug)]?.url ? '已设置' : '未设置'}</td>
        <td><a href="/admin/services/${item.id}/edit">编辑</a> &nbsp; <a href="/admin/services/${item.id}/delete" onclick="return confirm('确认删除该服务、关键词、AI内容、图片？删除后不可恢复。')" style="color:#e5484d">删除</a></td>
      </tr>`).join('')}
    </tbody></table>
  ` }))
})

type SeoGeneratedPageStats = {
  keywordCleanup: number
  duplicateKeywords: number
  duplicateKeywordGroups: number
  generatedCities: number
  generatedServices: number
  generatedLandings: number
  sitemapLandings: number
  publishedAiArticles: number
  generatedAiArticles: number
  lowScorePublishedAiArticles: number
  invalidCities: number
  invalidServices: number
  invalidLandings: number
  invalidTotal: number
  invalidDirectKeys: string[]
  legacyInvalid: { cities: string[]; services: string[]; landing: string[] }
}

async function getSeoGeneratedPageStats(env: Bindings): Promise<SeoGeneratedPageStats> {
  const [keywordCleanupRow, duplicateRow, positiveLandingRows, activeCityRows, activeServiceRows, directRows, legacyRow, aiArticleRow, publishedAiArticleRow, lowScoreArticleRow, serviceLinksRow] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM keywords WHERE COALESCE(opportunity_score,0) <= 0 OR city_id IS NULL OR service_id IS NULL").first(),
    env.DB.prepare("SELECT COUNT(*) AS duplicate_groups, COALESCE(SUM(n - 1),0) AS duplicate_count FROM (SELECT lower(trim(COALESCE(keyword,''))) AS normalized_keyword, COALESCE(city_id,-1) AS city_key, COALESCE(service_id,-1) AS service_key, COUNT(*) AS n FROM keywords GROUP BY normalized_keyword, city_key, service_key HAVING COUNT(*) > 1)").first(),
    env.DB.prepare("SELECT k.landing_slug, s.slug AS service_slug FROM keywords k JOIN cities c ON c.id=k.city_id JOIN services s ON s.id=k.service_id WHERE k.landing_slug IS NOT NULL AND COALESCE(k.opportunity_score,0) >= 65 AND c.is_active=1 AND s.is_active=1 ORDER BY c.sort_order, s.sort_order, k.id LIMIT 1000").all(),
    env.DB.prepare("SELECT slug FROM cities WHERE is_active=1").all(),
    env.DB.prepare("SELECT slug FROM services WHERE is_active=1").all(),
    env.DB.prepare("SELECT key FROM settings WHERE key LIKE 'ai_page:%'").all(),
    env.DB.prepare("SELECT value FROM settings WHERE key='ai_page_content_json'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE ai_generated=1").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE ai_generated=1 AND status='published'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE ai_generated=1 AND status='published' AND COALESCE(ai_score,0) < 65").first(),
    env.DB.prepare("SELECT value FROM settings WHERE key='service_external_links'").first(),
  ])
  const duplicateStats = duplicateRow as any
  const serviceLinks = getServiceExternalLinks((serviceLinksRow as any)?.value ? { service_external_links: String((serviceLinksRow as any).value) } : {})
  const validLandings = new Set((positiveLandingRows.results as any[]).filter((row) => !serviceLinks[String(row.service_slug || '').trim()]).map((row) => String(row.landing_slug || '').trim()).filter(Boolean))
  const validCities = new Set((activeCityRows.results as any[]).map((row) => String(row.slug || '').trim()).filter(Boolean))
  const validServices = new Set((activeServiceRows.results as any[]).map((row) => String(row.slug || '').trim()).filter(Boolean))
  const direct = { cities: new Set<string>(), services: new Set<string>(), landing: new Set<string>() }
  const invalidDirectKeys: string[] = []
  for (const row of directRows.results as any[]) {
    const key = String(row.key || '')
    const match = /^ai_page:(cities|services|landing):(.+)$/.exec(key)
    if (!match) continue
    const group = match[1] as 'cities' | 'services' | 'landing'
    const pageKey = match[2]
    direct[group].add(pageKey)
    const valid = group === 'landing' ? validLandings.has(pageKey) : group === 'cities' ? validCities.has(pageKey) : validServices.has(pageKey)
    if (!valid) invalidDirectKeys.push(key)
  }
  const legacy = { cities: new Set<string>(), services: new Set<string>(), landing: new Set<string>() }
  if ((legacyRow as any)?.value) {
    try {
      const raw = JSON.parse(String((legacyRow as any).value))
      for (const group of ['cities', 'services', 'landing'] as const) {
        const keys = raw?.[group] && typeof raw[group] === 'object' ? Object.keys(raw[group]) : []
        for (const pageKey of keys) legacy[group].add(String(pageKey))
      }
    } catch (e) { console.warn('ai_page_content_json parse failed while auditing cleanup', e) }
  }
  const legacyInvalid = {
    cities: Array.from(legacy.cities).filter((key) => !validCities.has(key)),
    services: Array.from(legacy.services).filter((key) => !validServices.has(key)),
    landing: Array.from(legacy.landing).filter((key) => !validLandings.has(key)),
  }
  const generatedCities = new Set([...direct.cities, ...legacy.cities]).size
  const generatedServices = new Set([...direct.services, ...legacy.services]).size
  const generatedLandings = new Set([...direct.landing, ...legacy.landing]).size
  const invalidCities = new Set([...legacyInvalid.cities, ...invalidDirectKeys.filter((key) => key.startsWith('ai_page:cities:')).map((key) => key.slice('ai_page:cities:'.length))]).size
  const invalidServices = new Set([...legacyInvalid.services, ...invalidDirectKeys.filter((key) => key.startsWith('ai_page:services:')).map((key) => key.slice('ai_page:services:'.length))]).size
  const invalidLandings = new Set([...legacyInvalid.landing, ...invalidDirectKeys.filter((key) => key.startsWith('ai_page:landing:')).map((key) => key.slice('ai_page:landing:'.length))]).size
  return {
    keywordCleanup: Number((keywordCleanupRow as any)?.n || 0),
    duplicateKeywords: Number(duplicateStats?.duplicate_count || 0),
    duplicateKeywordGroups: Number(duplicateStats?.duplicate_groups || 0),
    generatedCities, generatedServices, generatedLandings,
    sitemapLandings: validLandings.size,
    publishedAiArticles: Number((publishedAiArticleRow as any)?.n || 0),
    generatedAiArticles: Number((aiArticleRow as any)?.n || 0),
    lowScorePublishedAiArticles: Number((lowScoreArticleRow as any)?.n || 0),
    invalidCities, invalidServices, invalidLandings,
    invalidTotal: invalidCities + invalidServices + invalidLandings,
    invalidDirectKeys, legacyInvalid,
  }
}

async function cleanupInvalidSeoGeneratedPages(env: Bindings, stats: SeoGeneratedPageStats) {
  const statements = stats.invalidDirectKeys.map((key) => env.DB.prepare('DELETE FROM settings WHERE key=?').bind(key))
  for (let i = 0; i < statements.length; i += 50) {
    await env.DB.batch(statements.slice(i, i + 50))
  }

  const settingsRow = await env.DB.prepare("SELECT value FROM settings WHERE key='ai_page_content_json'").first() as any
  if (!settingsRow?.value) return
  try {
    const store = JSON.parse(String(settingsRow.value))
    let changed = false
    for (const group of ['cities', 'services', 'landing'] as const) {
      for (const key of stats.legacyInvalid[group]) {
        if (store?.[group] && Object.prototype.hasOwnProperty.call(store[group], key)) {
          delete store[group][key]
          changed = true
        }
      }
    }
    if (changed) {
      await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('ai_page_content_json', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(store)).run()
    }
  } catch (e) {
    console.warn('ai_page_content_json cleanup skipped because legacy JSON is invalid', e)
  }
}
async function deleteSitemapLandingPages(env: Bindings): Promise<number> {
  const serviceLinksRow = await env.DB.prepare("SELECT value FROM settings WHERE key='service_external_links'").first() as any
  const serviceLinks = getServiceExternalLinks(serviceLinksRow?.value ? { service_external_links: String(serviceLinksRow.value) } : {})
  const rows = (await env.DB.prepare("SELECT k.landing_slug, s.slug AS service_slug FROM keywords k JOIN cities c ON c.id=k.city_id JOIN services s ON s.id=k.service_id WHERE k.landing_slug IS NOT NULL AND COALESCE(k.opportunity_score,0) > 0 AND c.is_active=1 AND s.is_active=1 ORDER BY c.sort_order, s.sort_order, k.id LIMIT 1000").all()).results as any[]
  const slugs = Array.from(new Set(rows.filter((row) => !serviceLinks[String(row.service_slug || '').trim()]).map((row) => String(row.landing_slug || '').trim()).filter(Boolean)))
  if (!slugs.length) return 0
  const statements: any[] = []
  for (const slug of slugs) {
    statements.push(env.DB.prepare('DELETE FROM keywords WHERE landing_slug=?').bind(slug))
    statements.push(env.DB.prepare('DELETE FROM settings WHERE key=?').bind(aiContentSettingKey('landing', slug)))
  }
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50))
  const legacyRow = await env.DB.prepare("SELECT value FROM settings WHERE key='ai_page_content_json'").first() as any
  if (legacyRow?.value) {
    try {
      const store = JSON.parse(String(legacyRow.value))
      let changed = false
      for (const slug of slugs) {
        if (store?.landing && Object.prototype.hasOwnProperty.call(store.landing, slug)) { delete store.landing[slug]; changed = true }
      }
      if (changed) await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('ai_page_content_json',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(store)).run()
    } catch (e) { console.warn('legacy landing cleanup skipped because JSON is invalid', e) }
  }
  return slugs.length
}

async function deletePublishedAiArticles(env: Bindings): Promise<number> {
  const rows = (await env.DB.prepare("SELECT id FROM articles WHERE ai_generated=1 AND status='published' ORDER BY id").all()).results as any[]
  const statements: any[] = []
  for (const row of rows) {
    statements.push(env.DB.prepare('DELETE FROM social_posts WHERE article_id=?').bind(row.id))
    statements.push(env.DB.prepare('DELETE FROM review_logs WHERE article_id=?').bind(row.id))
    statements.push(env.DB.prepare('DELETE FROM articles WHERE id=?').bind(row.id))
  }
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50))
  return rows.length
}
async function deleteAllGeneratedSeoData(env: Bindings): Promise<{ keywords: number; aiArticles: number; aiPageSettings: number }> {
  const [keywordRow, articleRow, pageRow] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM keywords').first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE ai_generated=1").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'ai_page:%'").first(),
  ])
  const keywords = Number((keywordRow as any)?.n || 0)
  const aiArticles = Number((articleRow as any)?.n || 0)
  const aiPageSettings = Number((pageRow as any)?.n || 0)

  // 先清理文章关联，再删 AI 文章，避免留下审核日志/社交分发孤儿记录。
  await env.DB.batch([
    env.DB.prepare("DELETE FROM social_posts WHERE article_id IN (SELECT id FROM articles WHERE ai_generated=1)"),
    env.DB.prepare("DELETE FROM review_logs WHERE article_id IN (SELECT id FROM articles WHERE ai_generated=1)"),
    env.DB.prepare("DELETE FROM articles WHERE ai_generated=1"),
    env.DB.prepare('DELETE FROM keywords'),
    env.DB.prepare("DELETE FROM settings WHERE key LIKE 'ai_page:%'"),
    env.DB.prepare("DELETE FROM settings WHERE key='ai_page_content_json'"),
  ])

  return { keywords, aiArticles, aiPageSettings }
}

async function deleteDuplicateKeywordRows(env: Bindings): Promise<number> {
  const rows = (await env.DB.prepare("SELECT id, landing_slug FROM (SELECT id, landing_slug, ROW_NUMBER() OVER (PARTITION BY lower(trim(COALESCE(keyword,''))), COALESCE(city_id,-1), COALESCE(service_id,-1) ORDER BY COALESCE(opportunity_score,0) DESC, COALESCE(search_volume,0) DESC, id ASC) AS rn FROM keywords) WHERE rn > 1 ORDER BY id").all()).results as any[]
  if (!rows.length) return 0

  const statements = rows.map((row) => env.DB.prepare('DELETE FROM keywords WHERE id=?').bind(row.id))
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50))

  // 重复词可能与保留记录共用同一个 landing_slug。只有确认该 slug 已没有任何关键词记录时，才删除 AI 落地页内容。
  const slugs = Array.from(new Set(rows.map((row) => String(row.landing_slug || '').trim()).filter(Boolean)))
  const remainingSlugs = new Set<string>()
  for (let i = 0; i < slugs.length; i += 50) {
    const chunk = slugs.slice(i, i + 50)
    const placeholders = chunk.map(() => '?').join(',')
    const remaining = (await env.DB.prepare(`SELECT DISTINCT landing_slug FROM keywords WHERE landing_slug IN (${placeholders})`).bind(...chunk).all()).results as any[]
    for (const row of remaining) {
      const slug = String(row.landing_slug || '').trim()
      if (slug) remainingSlugs.add(slug)
    }
  }

  const orphanSlugs = slugs.filter((slug) => !remainingSlugs.has(slug))
  const cleanupSettings = orphanSlugs.map((slug) => env.DB.prepare('DELETE FROM settings WHERE key=?').bind(aiContentSettingKey('landing', slug)))
  for (let i = 0; i < cleanupSettings.length; i += 50) await env.DB.batch(cleanupSettings.slice(i, i + 50))

  if (orphanSlugs.length) {
    const settings = await readSettingsMap(env)
    const store = getAiContentStore(settings)
    let changed = false
    for (const slug of orphanSlugs) {
      if (Object.prototype.hasOwnProperty.call(store.landing, slug)) {
        delete store.landing[slug]
        changed = true
      }
    }
    if (changed) await saveSetting(env, 'ai_page_content_json', saveAiContentStore(store))
  }

  return rows.length
}

// ---- SEO 页面单项清理：服务器重新评分后，仅允许删除 AI 生成内容 ----
async function optimizeSeoAuditTarget(env: Bindings, target: SeoAuditView): Promise<string> {
  if (!target.aiGenerated) throw new Error('只允许优化 AI 生成内容')
  const globalSeoKeywords = await getGlobalSeoKeywords(env)

  if (target.type === 'home' || target.type === 'list') {
    const key = String(target.key || '')
    if (!['home', 'services', 'cities', 'articles', 'about', 'contact'].includes(key)) throw new Error('页面类型无效')
    const settings = await readSettingsMap(env)
    const pages = getPageSettings(settings)
    const page = pages[key as keyof typeof pages]
    if (!page) throw new Error('页面不存在')
    const ai = await generateAiPageContent(env, {
      type: 'page',
      pageLabel: page.labelZh,
      pagePath: page.path,
      title: page.titleZh,
      summary: page.subtitleZh,
      sourceContent: page.contentZh,
    })
    if (!ai) throw new Error('AI没有返回通过质量门槛的页面内容')
    const pageKeywordCandidates = [
      page.labelZh,
      page.labelZh + '服务',
      page.labelZh + '办理',
      page.labelZh + '流程',
      ...normalizeKeywordCandidates(globalSeoKeywords, 15),
    ]
    const pageKeywords = alignSeoKeywordsToContent(
      pageKeywordCandidates,
      ai.title,
      ai.summary,
      ai.content,
      5,
    )
    pages[key as keyof typeof pages] = {
      ...page,
      titleZh: ai.title,
      subtitleZh: ai.summary,
      contentZh: ai.content,
      seoKeywordsZh: pageKeywords.join(','),
      aiGenerated: true,
    }
    await saveSetting(env, 'page_settings_json', serializePageSettings(pages))
    return ai.title
  }

  const id = Number(target.dbId || 0)
  if (!id) throw new Error('页面 ID 无效')

  if (target.type === 'article') {
    const article = await env.DB.prepare('SELECT * FROM articles WHERE id=? LIMIT 1').bind(id).first() as any
    if (!article) throw new Error('文章不存在')
    const ai = await generateAiPageContent(env, {
      type: 'article',
      title: String(article.title || ''),
      summary: String(article.summary || ''),
      keywords: getArticleAiKeywords(String(article.title || ''), String(article.summary || '')),
      sourceContent: String(article.content || '').slice(0, 6000),
    })
    if (!ai) throw new Error('AI没有返回通过质量门槛的文章内容')
    const sourceUrl = String(article.source_url || '').trim()
    const sourceLink = sourceUrl
      ? '<p><strong>原文章链接：</strong><a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="nofollow noopener">' + escapeHtml(sourceUrl) + '</a></p>'
      : ''
    const content = String(ai.content || '').trim() + sourceLink
    const seo = autoArticleSeo(
      { title: ai.title || article.title, summary: ai.summary || article.summary, content },
      env.SITE_NAME || '网站内容平台',
      globalSeoKeywords,
    )
    await env.DB.prepare(
      "UPDATE articles SET title=?, summary=?, content=?, seo_title=?, seo_description=?, seo_keywords=?, ai_generated=1, updated_at=datetime('now') WHERE id=?"
    ).bind(
      String(ai.title || article.title).trim(),
      String(ai.summary || article.summary).trim(),
      content,
      seo.seo_title,
      seo.seo_description,
      seo.seo_keywords,
      id,
    ).run()
    await env.DB.prepare(
      'INSERT INTO review_logs (article_id, action, operator, note) VALUES (?, ?, ?, ?)'
    ).bind(id, 'ai_optimize', 'AI自动', 'SEO审计一键优化').run()
    return String(ai.title || article.title || target.title)
  }

  if (target.type === 'city') {
    const city = await env.DB.prepare('SELECT * FROM cities WHERE id=?').bind(id).first() as any
    if (!city) throw new Error('城市不存在')
    const keywords = await getCityAiKeywords(env, id, String(city.name || ''), globalSeoKeywords)
    const ai = await generateAiPageContent(env, { type: 'city', city: city.name, keywords })
    if (!ai) throw new Error('AI没有返回通过质量门槛的城市内容')
    const seo = autoCitySeo({ name: String(city.name || '') }, env.SITE_NAME || '网站内容平台', globalSeoKeywords)
    await env.DB.prepare('UPDATE cities SET seo_title=?, seo_description=?, seo_keywords=? WHERE id=?')
      .bind(seo.seo_title, seo.seo_description, normalizeSeoKeywords(keywords.length ? keywords : seo.seo_keywords, 5).join(','), id).run()
    await saveSetting(env, aiContentSettingKey('cities', String(city.slug || '')), JSON.stringify({ ...ai, updatedAt: new Date().toISOString() }))
    return String(ai.title || city.name || target.title)
  }

  if (target.type === 'service') {
    const service = await env.DB.prepare('SELECT * FROM services WHERE id=?').bind(id).first() as any
    if (!service) throw new Error('服务不存在')
    const keywords = await getServiceAiKeywords(env, id, String(service.name || ''), globalSeoKeywords)
    const ai = await generateAiPageContent(env, { type: 'service', service: service.name, keywords })
    if (!ai) throw new Error('AI没有返回通过质量门槛的服务内容')
    const seo = autoServiceSeo(
      { name: String(service.name || ''), summary: String(service.summary || '') },
      env.SITE_NAME || '网站内容平台',
      globalSeoKeywords,
    )
    await env.DB.prepare('UPDATE services SET seo_title=?, seo_description=?, seo_keywords=? WHERE id=?')
      .bind(seo.seo_title, seo.seo_description, normalizeSeoKeywords(keywords.length ? keywords : seo.seo_keywords, 5).join(','), id).run()
    await saveSetting(env, aiContentSettingKey('services', String(service.slug || '')), JSON.stringify({ ...ai, updatedAt: new Date().toISOString() }))
    return String(ai.title || service.name || target.title)
  }

  if (target.type === 'landing') {
    const kw = await env.DB.prepare(
      `SELECT k.*, ci.name AS city_name, ci.slug AS city_slug, s.name AS service_name, s.slug AS service_slug
       FROM keywords k
       LEFT JOIN cities ci ON ci.id=k.city_id
       LEFT JOIN services s ON s.id=k.service_id
       WHERE k.id=?`
    ).bind(id).first() as any
    if (!kw) throw new Error('落地页关键词不存在')
    const ai = await generateAiPageContent(env, {
      type: 'landing',
      city: kw.city_name,
      service: kw.service_name,
      keyword: kw.keyword,
      weight: Number(kw.opportunity_score || 0),
    })
    if (!ai) throw new Error('AI没有返回通过质量门槛的落地页内容')
    const key = kw.landing_slug || (String(kw.city_slug || '') + '-' + String(kw.service_slug || ''))
    await saveSetting(env, aiContentSettingKey('landing', key), JSON.stringify({
      ...ai,
      weight: Number(kw.opportunity_score || 0),
      updatedAt: new Date().toISOString(),
    }))
    return String(ai.title || (String(kw.city_name || '') + String(kw.service_name || '')))
  }

  throw new Error('不支持的 SEO 页面类型')
}

async function deleteSeoAuditTarget(env: Bindings, target: SeoAuditView): Promise<void> {
  if (!target.aiGenerated) throw new Error('只允许删除 AI 生成内容')

  if (target.type === 'home' || target.type === 'list') {
    const key = String(target.key || '')
    if (!['home', 'services', 'cities', 'articles', 'about', 'contact'].includes(key)) throw new Error('页面类型无效')
    const settings = await readSettingsMap(env)
    const store = getPageSettings(settings)
    const page = store[key as keyof typeof store]
    if (!page) throw new Error('页面不存在')
    store[key as keyof typeof store] = {
      ...page,
      titleZh: '',
      titleEn: '',
      subtitleZh: '',
      subtitleEn: '',
      contentZh: '',
      contentEn: '',
      seoKeywordsZh: '',
      seoKeywordsEn: '',
      aiGenerated: false,
    }
    await saveSetting(env, 'page_settings_json', serializePageSettings(store))
    if (key === 'home') await saveSetting(env, 'site_seo_ai_generated', '0')
    return
  }

  const id = Number(target.dbId || 0)
  if (!id) throw new Error('页面 ID 无效')

  if (target.type === 'article') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM social_posts WHERE article_id=?').bind(id),
      env.DB.prepare('DELETE FROM review_logs WHERE article_id=?').bind(id),
      env.DB.prepare('DELETE FROM articles WHERE id=? AND ai_generated=1').bind(id),
    ])
    return
  }

  const settings = await readSettingsMap(env)
  const store = getAiContentStore(settings)

  if (target.type === 'city') {
    const row = await env.DB.prepare('SELECT slug FROM cities WHERE id=?').bind(id).first() as any
    const slug = String(row?.slug || '')
    if (!slug) throw new Error('城市页面不存在')
    delete store.cities[slug]
    await env.DB.prepare('DELETE FROM settings WHERE key=?').bind(aiContentSettingKey('cities', slug)).run()
  } else if (target.type === 'service') {
    const row = await env.DB.prepare('SELECT slug FROM services WHERE id=?').bind(id).first() as any
    const slug = String(row?.slug || '')
    if (!slug) throw new Error('服务页面不存在')
    delete store.services[slug]
    await env.DB.prepare('DELETE FROM settings WHERE key=?').bind(aiContentSettingKey('services', slug)).run()
  } else if (target.type === 'landing') {
    const row = await env.DB.prepare('SELECT landing_slug FROM keywords WHERE id=?').bind(id).first() as any
    const landingSlug = String(row?.landing_slug || '')
    delete store.landing[landingSlug]
    if (landingSlug) {
      await env.DB.prepare('DELETE FROM settings WHERE key=?').bind(aiContentSettingKey('landing', landingSlug)).run()
    }
    await env.DB.prepare('DELETE FROM keywords WHERE id=?').bind(id).run()
  } else {
    throw new Error('不支持的 SEO 页面类型')
  }

  await saveSetting(env, 'ai_page_content_json', saveAiContentStore(store))
}

adminRoutes.post('/seo-audit/optimize-one', async (c) => {
  const body = await c.req.parseBody()
  const type = String(body.type || '')
  const key = String(body.key || '')
  const id = Number(body.id || 0)
  if (!['home', 'list', 'article', 'city', 'service', 'landing'].includes(type)) {
    return c.json({ ok: false, error: '无效的 SEO 页面类型' }, 400)
  }
  const { pages } = await buildPublicSeoAudit(c.env)
  const target = pages.find((p) =>
    p.type === type &&
    ((type === 'home' || type === 'list') ? String(p.key) === key : Number(p.dbId || 0) === id)
  )
  if (!target) return c.json({ ok: false, error: '页面不存在或已被修改' }, 404)
  if (!target.aiGenerated) return c.json({ ok: false, error: '只允许 AI 生成内容进入 AI 优化流程' }, 400)
  if (target.audit.status !== 'weak' && target.audit.status !== 'blocked') {
    return c.json({ ok: false, error: '当前页面无需 AI 低分优化' }, 400)
  }

  try {
    const title = await optimizeSeoAuditTarget(c.env, target)
    await syncPageSeoKeywords(c.env)
    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    return c.json({ ok: true, title, scoreBefore: target.audit.score })
  } catch (e) {
    console.error('SEO audit optimize one failed', e)
    return c.json({ ok: false, error: errorMessage(e, 'SEO 页面优化失败') }, 503)
  }
})

adminRoutes.post('/seo-audit/delete', async (c) => {
  const body = await c.req.parseBody()
  const type = String(body.type || '')
  const id = Number(body.id || 0)
  if (!['home', 'list', 'article', 'city', 'service', 'landing'].includes(type) || ((type !== 'home' && type !== 'list') && !id)) {
    return c.redirect('/admin/keywords?error=' + encodeURIComponent('无效的 SEO 页面清理请求。'))
  }

  const { pages } = await buildPublicSeoAudit(c.env)
  const target = pages.find((p) => p.type === type && ((type === 'home' || type === 'list') ? String(p.key) === String(body.key || '') : Number(p.dbId || 0) === id))
  if (!target) return c.redirect('/admin/keywords?error=' + encodeURIComponent('页面不存在，或当前已经不满足清理条件。'))
  if (!target.aiGenerated) return c.redirect('/admin/keywords?error=' + encodeURIComponent('只允许删除 AI 生成内容，人工内容不会被此入口删除。'))

  try {
    await deleteSeoAuditTarget(c.env, target)
    await syncPageSeoKeywords(c.env)
    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    c.header('Cache-Control', 'no-store')
    return c.redirect('/admin/keywords?message=' + encodeURIComponent('已删除：' + target.title + '（评分 ' + target.audit.score + '）。'))
  } catch (e) {
    console.error('SEO audit single delete failed', e)
    return c.redirect('/admin/keywords?error=' + encodeURIComponent(errorMessage(e, 'SEO 页面删除失败')))
  }
})

// 一键优化：每次 HTTP 只跑 1 次 AI，浏览器自动连续调用，避免单个 Worker 因多次 AI 生成而触发 1101。
adminRoutes.post('/seo-audit/optimize-low-batch', async (c) => {
  const body = await c.req.parseBody()
  const excluded = new Set(
    String(body.exclude || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 100),
  )
  const { pages } = await buildPublicSeoAudit(c.env)
  const targets = pages
    .filter((p) => p.audit.indexable && p.audit.score >= 50 && p.audit.score < 68 && p.aiGenerated && ['home', 'list', 'article', 'city', 'service', 'landing'].includes(p.type) && (p.type === 'home' || p.type === 'list' || p.dbId))
    .filter((p) => !excluded.has(String(p.type) + ':' + String(p.dbId || p.key)))
    .sort((a, b) => a.audit.score - b.audit.score)

  if (!targets.length) return c.json({ ok: true, complete: true, processed: 0, remaining: 0 })
  try {
    const target = targets[0]
    const title = await optimizeSeoAuditTarget(c.env, target)
    const key = String(target.type) + ':' + String(target.dbId)
    return c.json({ ok: true, complete: false, processed: 1, title, key, remainingHint: Math.max(0, targets.length - 1) })
  } catch (e) {
    console.error('SEO audit optimize batch failed', e)
    return c.json({ ok: false, error: errorMessage(e, 'SEO 页面优化失败') }, 503)
  }
})

// 一键删除：每次只删除少量低价值 AI 内容；包含不可索引 AI 页面。人工内容不进入队列。
adminRoutes.post('/seo-audit/cleanup-low-batch', async (c) => {
  const { pages } = await buildPublicSeoAudit(c.env)
  const targets = pages
    .filter((p) => (!p.audit.indexable || p.audit.score < 50) && p.aiGenerated && ['home', 'list', 'article', 'city', 'service', 'landing'].includes(p.type) && (p.type === 'home' || p.type === 'list' || p.dbId))
    .sort((a, b) => a.audit.score - b.audit.score)
    .slice(0, 10)

  if (!targets.length) return c.json({ ok: true, complete: true, processed: 0, remaining: 0 })

  let processed = 0
  const errors: string[] = []
  for (const target of targets) {
    try {
      await deleteSeoAuditTarget(c.env, target)
      processed++
    } catch (e) {
      errors.push(errorMessage(e, '删除失败'))
    }
  }
  return c.json({
    ok: errors.length === 0,
    complete: targets.length < 10,
    processed,
    remainingHint: Math.max(0, targets.length === 10 ? 1 : 0),
    errors: errors.slice(0, 3),
  }, errors.length ? 503 : 200)
})

// 兼容旧入口：仍可由其他页面直接提交，默认只清理评分 <50 或不可索引的 AI 内容。
adminRoutes.post('/seo-audit/cleanup-low', async (c) => {
  const { pages } = await buildPublicSeoAudit(c.env)
  const thresholdRaw = Number((await c.req.parseBody()).threshold || 50)
  const threshold = Math.min(50, Math.max(0, Number.isFinite(thresholdRaw) ? Math.trunc(thresholdRaw) : 50))
  const targets = pages
    .filter((p) => (!p.audit.indexable || p.audit.score < threshold) && p.aiGenerated && ['article', 'city', 'service', 'landing'].includes(p.type) && p.dbId)
    .sort((a, b) => a.audit.score - b.audit.score)
    .slice(0, 10)
  if (!targets.length) {
    return c.redirect('/admin/keywords?error=' + encodeURIComponent('当前没有可删除的低质量/不可索引 AI 内容。'))
  }
  let removed = 0
  for (const target of targets) {
    try { await deleteSeoAuditTarget(c.env, target); removed++ } catch (e) { console.error('SEO cleanup target failed', e) }
  }
  return c.redirect('/admin/keywords?message=' + encodeURIComponent('已清理 ' + removed + ' 个低质量/不可索引 AI 内容；如仍有项目，可继续一键清理。'))
})

// ---- 关键词管理 ----

// 清理无权重/无关联对象的矩阵，并同时清理没有有效 SEO 入口的 AI 生成页。
// opportunity_score <= 0 的矩阵记录不会再作为城市×服务落地页的 SEO 入口。
adminRoutes.post('/keywords/cleanup', async (c) => {
  const body = await c.req.parseBody()
  const cleanupAllGenerated = body.cleanup_all_generated === 'on'
  const cleanupInvalid = body.cleanup_invalid === 'on'
  const cleanupDuplicates = body.cleanup_duplicate_keywords === 'on'
  const deleteSitemap = body.delete_sitemap_landings === 'on'
  const deleteAiArticles = body.delete_ai_articles === 'on'
  const deleteLowScore = body.delete_low_ai_articles === 'on'
  const thresholdRaw = Number(body.ai_score_threshold || 65)
  const aiScoreThreshold = Math.min(100, Math.max(0, Number.isFinite(thresholdRaw) ? Math.trunc(thresholdRaw) : 65))
  let cleaned = 0
  let duplicateCleaned = 0
  let cleanedPages = 0
  let cleanedArticles = 0
  let lowScoreArticles = 0
  let allGeneratedKeywords = 0
  let allGeneratedArticles = 0
  let allGeneratedAiPages = 0

  if (cleanupAllGenerated) {
    const all = await deleteAllGeneratedSeoData(c.env)
    allGeneratedKeywords = all.keywords
    allGeneratedArticles = all.aiArticles
    allGeneratedAiPages = all.aiPageSettings
  } else {
    if (cleanupDuplicates) duplicateCleaned = await deleteDuplicateKeywordRows(c.env)
    if (cleanupInvalid) {
      const stale = (await c.env.DB.prepare("SELECT id FROM keywords WHERE COALESCE(opportunity_score,0) <= 0 OR city_id IS NULL OR service_id IS NULL ORDER BY id").all()).results as any[]
      const statements = stale.map((row) => c.env.DB.prepare('DELETE FROM keywords WHERE id=?').bind(row.id))
      for (let i = 0; i < statements.length; i += 50) await c.env.DB.batch(statements.slice(i, i + 50))
      cleaned = stale.length
      const beforePageCleanup = await getSeoGeneratedPageStats(c.env)
      await cleanupInvalidSeoGeneratedPages(c.env, beforePageCleanup)
    }
    if (deleteSitemap) cleanedPages = await deleteSitemapLandingPages(c.env)
    if (deleteAiArticles) cleanedArticles = await deletePublishedAiArticles(c.env)
    if (deleteLowScore) {
      const rows = (await c.env.DB.prepare("SELECT id FROM articles WHERE ai_generated=1 AND status='published' AND COALESCE(ai_score,0) < ? ORDER BY id").bind(aiScoreThreshold).all()).results as any[]
      const statements: any[] = []
      for (const row of rows) {
        statements.push(c.env.DB.prepare('DELETE FROM social_posts WHERE article_id=?').bind(row.id))
        statements.push(c.env.DB.prepare('DELETE FROM review_logs WHERE article_id=?').bind(row.id))
        statements.push(c.env.DB.prepare('DELETE FROM articles WHERE id=?').bind(row.id))
      }
      for (let i = 0; i < statements.length; i += 50) await c.env.DB.batch(statements.slice(i, i + 50))
      lowScoreArticles = rows.length
    }
  }

  // 清理只负责删除无效/重复生产数据，不隐式改写页面 SEO；页面 SEO 批量规范统一从 /admin/seo/auto-fill 执行。
  const after = await getSeoGeneratedPageStats(c.env)

  // 全量清理时使用 Workers Cache 的 purgeEverything；普通选择性清理仍保持原有逻辑。
  // 这是 Worker 自身缓存的同步失效，不依赖浏览器缓存，也不清空 CACHE_KV（其中保存登录 JWT_SECRET）。
  if (cleanupAllGenerated) {
    const cachePurged = await purgeCacheEverything(c.executionCtx)
    if (!cachePurged) {
      console.warn('full production cleanup completed but Worker cache purgeEverything was unavailable or failed')
    }
  } else {
    await purgeCacheAll(c.executionCtx)
  }
  c.header('Cache-Control', 'no-store')
  c.header('Cloudflare-CDN-Cache-Control', 'no-store')

  const qs = new URLSearchParams({
    cleaned: String(cleaned),
    duplicate_cleaned: String(duplicateCleaned),
    cleaned_pages: String(cleanedPages),
    cleaned_articles: String(cleanedArticles),
    low_score_articles: String(lowScoreArticles),
    all_generated_keywords: String(allGeneratedKeywords),
    all_generated_articles: String(allGeneratedArticles),
    all_generated_ai_pages: String(allGeneratedAiPages),
    ai_score_threshold: String(aiScoreThreshold),
    remaining: String(after.keywordCleanup),
    remaining_duplicates: String(after.duplicateKeywords),
    remaining_pages: String(after.invalidTotal),
    sitemap_remaining: String(after.sitemapLandings),
    ai_articles_remaining: String(after.publishedAiArticles),
  })
  return c.redirect('/admin/keywords?' + qs.toString())
})

adminRoutes.get('/keywords', async (c) => {
  const [rowsResult, siteKeywords, seoStats, seoAudit] = await Promise.all([
    c.env.DB.prepare(`SELECT k.*, ci.name as city_name, ci.slug as city_slug, s.name as service_name, s.slug as service_slug FROM keywords k LEFT JOIN cities ci ON ci.id = k.city_id LEFT JOIN services s ON s.id = k.service_id ORDER BY k.opportunity_score DESC LIMIT 200`).all(),
    getGlobalSeoKeywords(c.env),
    getSeoGeneratedPageStats(c.env),
    buildPublicSeoAudit(c.env),
  ])
  const rows = rowsResult.results
  const params = {
    cleanedCount: String(c.req.query('cleaned') || '').trim(),
    duplicateCleaned: String(c.req.query('duplicate_cleaned') || '').trim(),
    cleanedPages: String(c.req.query('cleaned_pages') || '').trim(),
    cleanedArticles: String(c.req.query('cleaned_articles') || '').trim(),
    lowScoreArticles: String(c.req.query('low_score_articles') || '').trim(),
    aiScoreThreshold: String(c.req.query('ai_score_threshold') || '65').trim(),
    allGeneratedKeywords: String(c.req.query('all_generated_keywords') || '').trim(),
    allGeneratedArticles: String(c.req.query('all_generated_articles') || '').trim(),
    allGeneratedAiPages: String(c.req.query('all_generated_ai_pages') || '').trim(),
  }
  const message = c.req.query('error')
    || (c.req.query('keywords_saved') === '1' ? '固定关键词（全站候选词库）已保存；不会被“一键规范全部页面 SEO”自动改写。' : '')
    || (c.req.query('ai') === '1' ? 'AI关键词已生成并追加到全站候选词库；页面 SEO 仍按各页面主题单独规范。' : '')
    || (params.allGeneratedKeywords || params.allGeneratedArticles || params.allGeneratedAiPages
      ? '生产库全量清理完成：SEO关键词 ' + (params.allGeneratedKeywords || '0') + ' 条；AI文章 ' + (params.allGeneratedArticles || '0') + ' 篇；AI SEO页面设置 ' + (params.allGeneratedAiPages || '0') + ' 条；已同步删除文章审核日志/社交分发关联记录，并在返回前清理公开缓存。'
      : (params.cleanedCount || params.duplicateCleaned || params.cleanedPages || params.cleanedArticles || params.lowScoreArticles
        ? '生产库清理完成：无效关键词 ' + (params.cleanedCount || '0') + ' 条；重复关键词 ' + (params.duplicateCleaned || '0') + ' 条；有效 Sitemap SEO 落地页 ' + (params.cleanedPages || '0') + ' 个；已发布 AI 文章 ' + (params.cleanedArticles || '0') + ' 篇；AI评分低于 ' + params.aiScoreThreshold + ' 的已发布 AI 文章 ' + (params.lowScoreArticles || '0') + ' 篇，并已同步清理关联日志/分发记录及公开缓存。'
        : ''))
  const cleanupPending = seoStats.keywordCleanup + seoStats.duplicateKeywords + seoStats.invalidTotal
  return c.html(renderKeywordsList(rows as any, siteKeywords, message, cleanupPending, seoStats, seoAudit))
})

adminRoutes.post('/keywords/ai-generate', async (c) => {
  try {
    const settings = await readSettingsMap(c.env)
    const cityRows = (await c.env.DB.prepare("SELECT name FROM cities WHERE is_active=1 ORDER BY sort_order, id LIMIT 30").all()).results as any[]
    const serviceRows = (await c.env.DB.prepare("SELECT name FROM services WHERE is_active=1 ORDER BY sort_order, id LIMIT 30").all()).results as any[]
    const existing = String(settings.site_keywords || '').trim()
    const generated = await generateAiKeywords(c.env, {
      cities: cityRows.map((row) => String(row.name || '')).filter(Boolean),
      services: serviceRows.map((row) => String(row.name || '')).filter(Boolean),
      existingKeywords: existing,
    })
    if (!generated.length) {
      const status = await getAiRouteStatus(c.env)
      const message = status.ok ? aiEmptyResultMessage('AI关键词生成', status.settings) : status.message
      return c.redirect('/admin/keywords?error=' + encodeURIComponent(message))
    }

    const oldKeywords = getKeywordList(existing)
    // 全站词库只保留少量主题词；页面 SEO 使用各自的城市/服务/文章意图，不再把全站词复制到每一页。
    const siteKeywords = normalizeKeywordCandidates([...oldKeywords, ...generated], 15).join(',')
    await saveSetting(c.env, 'site_keywords', siteKeywords)
    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    return c.redirect('/admin/keywords?ai=1')
  } catch (e) {
    console.error('AI keyword generation failed', e)
    return c.redirect('/admin/keywords?error=' + encodeURIComponent(errorMessage(e, 'AI关键词生成失败')))
  }
})

adminRoutes.post('/keywords/settings', async (c) => {
  const b = await c.req.parseBody()
  const siteKeywords = normalizeKeywordCandidates(String(b.site_keywords || ''), 15).join(',')
  await saveSetting(c.env, 'site_keywords', siteKeywords)
  // 固定关键词（全站候选词库）是人工维护的数据源；保存它不能反过来重写城市/服务/文章的页面 SEO。
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/keywords?keywords_saved=1')
})

// 一键生成/更新“城市 × 服务”关键词矩阵；保留人工搜索量，并统一重新计算机会分。
async function generateKeywordMatrix(env: Bindings): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO keywords
      (keyword, city_id, service_id, status, difficulty, opportunity_score, landing_slug, city_weight, service_weight)
     SELECT
      c.name || s.name, c.id, s.id, 'pending',
      CASE
        WHEN c.tier='一线' AND COALESCE(s.demand_weight,50)>=70 THEN '高'
        WHEN c.tier='一线' OR COALESCE(s.demand_weight,50)>=70 THEN '中'
        ELSE '低'
      END,
      CAST(ROUND(
        (
          (CASE c.tier WHEN '一线' THEN 100 WHEN '新一线' THEN 75 WHEN '二线' THEN 55 WHEN '三线' THEN 35 ELSE 50 END) * 0.5
          + COALESCE(s.demand_weight,50) * 0.3
          + (100 - CASE
              WHEN c.tier='一线' AND COALESCE(s.demand_weight,50)>=70 THEN 55
              WHEN c.tier='一线' OR COALESCE(s.demand_weight,50)>=70 THEN 30
              ELSE 10
            END) * 0.2
        ) * 0.8
      ) AS INTEGER),
      c.slug || '-' || s.slug,
      CASE c.tier WHEN '一线' THEN 100 WHEN '新一线' THEN 75 WHEN '二线' THEN 55 WHEN '三线' THEN 35 ELSE 50 END,
      COALESCE(s.demand_weight,50)
     FROM cities c CROSS JOIN services s
     WHERE c.is_active=1 AND s.is_active=1
     ON CONFLICT(city_id, service_id) DO UPDATE SET
       keyword=excluded.keyword,
       difficulty=excluded.difficulty,
       landing_slug=excluded.landing_slug,
       city_weight=excluded.city_weight,
       service_weight=excluded.service_weight`
  ).run()
  const changed = Number((result as any)?.meta?.changes || 0)
  await rescoreAllKeywords(env)
  return changed
}

adminRoutes.post('/keywords/generate', async (c) => {
  try {
    const changed = await generateKeywordMatrix(c.env)
    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    return c.redirect('/admin/keywords?message=' + encodeURIComponent('关键词矩阵已生成/更新：处理 ' + changed + ' 条城市×服务记录，并按统一规则重新计算机会分。'))
  } catch (e) {
    console.error('keyword matrix generation failed', e)
    return c.redirect('/admin/keywords?error=' + encodeURIComponent('关键词矩阵生成失败：' + errorMessage(e, '未知错误')))
  }
})

adminRoutes.get('/keywords/:id/edit', async (c) => {
  const kw = await c.env.DB.prepare('SELECT * FROM keywords WHERE id=?').bind(c.req.param('id')).first()
  if (!kw) return c.notFound()
  const settings = await readSettingsMap(c.env)
  const aiContent = await getAiContentEntryDb(c.env, settings, 'landing', String((kw as any).landing_slug || ''))
  const landingKey = String((kw as any).landing_slug || '')
  const pageContact = getPageContact(settings, 'landing:' + landingKey, getContactMethods(settings))
  return c.html(renderKeywordForm(kw, aiContent, pageContact))
})

adminRoutes.post('/keywords/:id/delete', async (c) => {
  const id = c.req.param('id')
  const kw = await c.env.DB.prepare('SELECT landing_slug FROM keywords WHERE id=?').bind(id).first() as any
  if (!kw) return c.notFound()
  const settings = await readSettingsMap(c.env)
  const store = getAiContentStore(settings)
  if (kw.landing_slug) delete store.landing[String(kw.landing_slug)]
  await c.env.DB.prepare('DELETE FROM keywords WHERE id=?').bind(id).run()
  if (kw.landing_slug) await c.env.DB.prepare('DELETE FROM settings WHERE key=?').bind(aiContentSettingKey('landing', String(kw.landing_slug))).run()
  await saveSetting(c.env, 'ai_page_content_json', saveAiContentStore(store))
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/keywords')
})

adminRoutes.post('/keywords/:id/content/delete', async (c) => {
  const id = c.req.param('id')
  const kw = await c.env.DB.prepare('SELECT landing_slug FROM keywords WHERE id=?').bind(id).first() as any
  if (!kw) return c.notFound()
  const settings = await readSettingsMap(c.env)
  const store = getAiContentStore(settings)
  if (kw.landing_slug) delete store.landing[String(kw.landing_slug)]
  if (kw.landing_slug) await c.env.DB.prepare('DELETE FROM settings WHERE key=?').bind(aiContentSettingKey('landing', String(kw.landing_slug))).run()
  await saveSetting(c.env, 'ai_page_content_json', saveAiContentStore(store))
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/keywords/' + id + '/edit')
})

adminRoutes.post('/keywords/:id/ai-content', async (c) => {
  const id = c.req.param('id')
  const kw = await c.env.DB.prepare(
    `SELECT k.*, ci.name as city_name, ci.slug as city_slug, ci.tier as city_tier,
            s.name as service_name, s.slug as service_slug, s.demand_weight as service_weight
     FROM keywords k
     LEFT JOIN cities ci ON ci.id=k.city_id
     LEFT JOIN services s ON s.id=k.service_id
     WHERE k.id=?`
  ).bind(id).first() as any
  if (!kw) return c.notFound()
  const ai = await generateAiPageContent(c.env, {
    type: 'landing',
    city: kw.city_name,
    service: kw.service_name,
    keyword: kw.keyword,
    weight: Number(kw.opportunity_score || 0),
  })
  if (!ai) {
    const status = await getAiRouteStatus(c.env)
    return c.text(status.ok ? aiEmptyResultMessage('AI落地页生成', status.settings) : status.message, 503)
  }
  const key = kw.landing_slug || (kw.city_slug + '-' + kw.service_slug)
  await saveSetting(c.env, aiContentSettingKey('landing', key), JSON.stringify({ ...ai, weight: Number(kw.opportunity_score || 0), updatedAt: new Date().toISOString() }))
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/keywords/' + id + '/edit')
})

adminRoutes.post('/keywords/:id/edit', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.parseBody()
  const searchVolume = parseInt(String(b.search_volume || '0'), 10) || 0
  const difficulty = String(b.difficulty || '中')
  const kw = await c.env.DB.prepare(
    `SELECT k.*, ci.tier as city_tier, s.demand_weight as service_weight
     FROM keywords k LEFT JOIN cities ci ON ci.id=k.city_id LEFT JOIN services s ON s.id=k.service_id WHERE k.id=?`
  ).bind(id).first() as any
  const score = calcOpportunityScore({ tier: kw.city_tier || '二线', serviceWeight: kw.service_weight ?? 50, difficulty, searchVolume })
  await c.env.DB.prepare(
    'UPDATE keywords SET search_volume=?, difficulty=?, opportunity_score=?, note=?, status=? WHERE id=?'
  ).bind(searchVolume, difficulty, score, b.note || '', b.status || kw.status, id).run()
  const settings = await readSettingsMap(c.env)
  const landingKey = String((kw as any).landing_slug || '')
  return c.redirect('/admin/keywords')
})

// ---- 服务列表(简单页,复用城市列表模板风格由 renderServiceForm 链接进入)----
// ---- 采集任务运行日志 ----
adminRoutes.get('/collection-logs', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT * FROM collection_logs ORDER BY created_at DESC LIMIT 100').all()).results
  const message = c.req.query('deleted') === 'all' ? '已一键删除全部采集日志。' : ''
  return c.html(renderCollectionLogsList(rows as any, message))
})

adminRoutes.post('/collection-logs/delete-all', async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM collection_logs').run()
  } catch (e) {
    console.error('delete all collection logs failed', e)
    return c.text('删除全部采集日志失败', 500)
  }
  return c.redirect('/admin/collection-logs?deleted=all')
})

adminRoutes.post('/collection-logs/:id/delete', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  try {
    await c.env.DB.prepare('DELETE FROM collection_logs WHERE id=?').bind(id).run()
  } catch (e) {
    console.error('delete collection log failed', e)
    return c.text('删除采集日志失败', 500)
  }
  return c.redirect('/admin/collection-logs')
})

// ---- 新闻采集源 ----
adminRoutes.get('/news-sources', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT * FROM news_sources ORDER BY id DESC').all()).results
  const collectedArticles = (await c.env.DB.prepare("SELECT id, title, slug, source_name, source_url, status, created_at FROM articles WHERE ai_generated=1 ORDER BY created_at DESC LIMIT 200").all()).results
  const settings = await readSettingsMap(c.env)
  const schedule = {
    enabled: settings.news_collection_enabled === '1',
    time: /^\d{2}:[0-5]\d$/.test(settings.news_collection_time || '') ? settings.news_collection_time : '08:00',
  }
  const message = c.req.query('error')
    || (c.req.query('started') === '1' ? '采集任务已在后台启动。请稍后查看“采集日志”确认抓取、AI解读和自动发布结果。' : '')
    || (c.req.query('collected') === '1' ? '新闻采集完成：AI通过质量门槛后按当前“自动发布”设置处理；失败或低质量内容不会发布。' : '')
    || (c.req.query('schedule_saved') === '1' ? '定时采集时间已保存。' : '')
  return c.html(renderNewsSourcesList(rows as any, collectedArticles as any, message, schedule))
})


adminRoutes.post('/news-sources/collect', async (c) => {
  c.executionCtx.waitUntil(
    runNewsCollection(c.env, undefined, c.executionCtx, resolveSiteUrl(c)).catch((e) => console.error('manual news collection failed', e))
  )
  return c.redirect('/admin/news-sources?started=1')
})

adminRoutes.post('/news-sources/:id/collect', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  const source = await c.env.DB.prepare('SELECT id FROM news_sources WHERE id=?').bind(id).first()
  if (!source) return c.notFound()
  c.executionCtx.waitUntil(
    runNewsCollection(c.env, id, c.executionCtx, resolveSiteUrl(c)).catch((e) => console.error('single news source collection failed', e))
  )
  return c.redirect('/admin/news-sources?started=1')
})

adminRoutes.post('/news-sources/:id/analyze', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  const source = await c.env.DB.prepare('SELECT id, name, feed_url FROM news_sources WHERE id=? LIMIT 1').bind(id).first() as any
  if (!source) return c.notFound()

  const aiSettings = await getAiSettings(c.env)
  if (!aiSettings.enabled) {
    return c.redirect('/admin/news-sources/' + id + '/edit?error=' + encodeURIComponent('AI 功能当前已停用，请先在 AI 设置中启用。'))
  }

  c.executionCtx.waitUntil(
    (async () => {
      try {
        const result = await analyzeNewsSource(c.env, String(source.feed_url || ''), String(source.name || ''), aiSettings)
        await saveSetting(
          c.env,
          'news_source_analysis:' + String(id),
          JSON.stringify({
            status: result.analysis ? 'ok' : 'no-candidates',
            sourceUrl: String(source.feed_url || ''),
            method: result.analysis?.method || 'ai-source-page',
            summary: result.analysis?.summary || 'AI 已分析来源页面，但没有识别到可核验的新闻候选。',
            items: result.analysis?.items || [],
            updatedAt: new Date().toISOString(),
          }),
        )
      } catch (e) {
        console.error('manual AI source analysis failed', source.feed_url, e)
        await saveSetting(
          c.env,
          'news_source_analysis:' + String(id),
          JSON.stringify({
            status: 'error',
            sourceUrl: String(source.feed_url || ''),
            summary: errorMessage(e, '来源分析失败').slice(0, 1200),
            items: [],
            updatedAt: new Date().toISOString(),
          }),
        )
      }
    })(),
  )
  return c.redirect('/admin/news-sources/' + id + '/edit?analyzing=1')
})

adminRoutes.post('/news-sources/:id/analyze-publish', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  const source = await c.env.DB.prepare('SELECT id, name, feed_url FROM news_sources WHERE id=? LIMIT 1').bind(id).first() as any
  if (!source) return c.notFound()

  const form = await c.req.parseBody()
  const candidateIndex = Number(form.candidate_index)
  if (!Number.isInteger(candidateIndex) || candidateIndex < 0) {
    return c.redirect('/admin/news-sources/' + id + '/edit?error=' + encodeURIComponent('没有选择有效的 AI 候选'))
  }

  const analysisRow = await c.env.DB.prepare('SELECT value FROM settings WHERE key=?')
    .bind('news_source_analysis:' + String(id)).first() as any
  let analysis: any = null
  try { analysis = analysisRow?.value ? JSON.parse(String(analysisRow.value)) : null } catch {}
  const candidates = Array.isArray(analysis?.items) ? analysis.items : []
  const candidate = candidates[candidateIndex]
  if (!candidate?.title || !candidate?.link) {
    return c.redirect('/admin/news-sources/' + id + '/edit?error=' + encodeURIComponent('该 AI 候选已不存在，请先重新分析来源地址 / 列表页'))
  }

  const aiSettings = await getAiSettings(c.env)
  if (!aiSettings.enabled) {
    return c.redirect('/admin/news-sources/' + id + '/edit?error=' + encodeURIComponent('AI 功能当前已停用，请先在 AI 设置中启用'))
  }

  c.executionCtx.waitUntil(
    publishAnalyzedNewsCandidate(c.env, id, {
      title: String(candidate.title || ''),
      link: String(candidate.link || ''),
      evidence: String(candidate.evidence || ''),
      confidence: Number(candidate.confidence || 0),
    }, resolveSiteUrl(c), c.executionCtx).catch(async (e) => {
      const errorText = errorMessage(e, '发布失败').slice(0, 1200)
      console.error('publish analyzed news candidate failed', {
        sourceId: id,
        candidateIndex,
        error: errorText,
      })
      try {
        await c.env.DB.prepare(
          'INSERT INTO collection_logs (source_name, fetched_count, created_count, published_count, error) VALUES (?, 1, 0, 0, ?)'
        ).bind(String(source.name || '新闻来源'), '候选 AI 解读发布异常：' + errorText).run()
      } catch (logError) {
        console.error('write candidate publish failure log failed', logError)
      }
      try {
        await saveSetting(
          c.env,
          'news_source_analysis_publish_error:' + String(id),
          JSON.stringify({
            candidateIndex,
            title: String(candidate.title || ''),
            link: String(candidate.link || ''),
            error: errorMessage(e, '发布失败').slice(0, 1200),
            updatedAt: new Date().toISOString(),
          }),
        )
      } catch {}
    }),
  )
  return c.redirect('/admin/news-sources/' + id + '/edit?publishing=1')
})

adminRoutes.post('/news-sources/schedule', async (c) => {
  const b = await c.req.parseBody()
  const enabled = b.enabled ? '1' : '0'
  const time = String(b.collection_time || '').trim()
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return c.redirect('/admin/news-sources?error=' + encodeURIComponent('定时任务时间格式不正确'))
  }
  const minute = Number(time.slice(3, 5))
  if (minute % 5 !== 0) {
    return c.redirect('/admin/news-sources?error=' + encodeURIComponent('定时任务目前按 5 分钟一个时间点设置，例如 08:00、08:05、18:30'))
  }
  await saveSetting(c.env, 'news_collection_enabled', enabled)
  await saveSetting(c.env, 'news_collection_time', time)
  await saveSetting(c.env, 'news_auto_publish', '0')
  return c.redirect('/admin/news-sources?schedule_saved=1')
})

adminRoutes.post('/news-sources/articles/:id/recreate', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  const article = await c.env.DB.prepare('SELECT * FROM articles WHERE id=? AND ai_generated=1').bind(id).first() as any
  if (!article) return c.notFound()
  const slug = 'news-copy-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  try {
    const created = await c.env.DB.prepare(
      `INSERT INTO articles
        (title, slug, category, summary, content, source_url, source_name, ai_generated, credibility_score,
         status, published_at, seo_title, seo_keywords, seo_description, card_svg, ai_score, slides_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'draft', NULL, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    ).bind(
      String(article.title || '').trim(), slug, String(article.category || '政策解读'),
      String(article.summary || '').trim(), String(article.content || '').trim() || '<p>请补充文章正文。</p>',
      String(article.source_url || ''), String(article.source_name || ''), Number(article.credibility_score || 70),
      String(article.seo_title || '').trim(), String(article.seo_keywords || '').trim(), String(article.seo_description || '').trim(),
      article.card_svg || null, Number(article.ai_score || 60), article.slides_json || '[]',
    ).first() as any
    await c.env.DB.prepare(
      'INSERT INTO review_logs (article_id, action, operator, note) VALUES (?, ?, ?, ?)'
    ).bind(created.id, 'copy_for_edit', 'admin', '已采集文章重新提交创建为新的草稿').run()
    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    return c.redirect('/admin/news-sources?collected=1')
  } catch (e) {
    console.error('recreate collected article failed', e)
    return c.redirect('/admin/news-sources?error=' + encodeURIComponent(errorMessage(e, '重新创建文章失败')))
  }
})

adminRoutes.get('/news-sources/:id/edit', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  const source = await c.env.DB.prepare('SELECT * FROM news_sources WHERE id=? LIMIT 1').bind(id).first() as any
  if (!source) return c.notFound()
  const analysisRow = await c.env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('news_source_analysis:' + String(id)).first() as any
  let sourceAnalysis: any = null
  try { sourceAnalysis = analysisRow?.value ? JSON.parse(String(analysisRow.value)) : null } catch {}
  const analysisItems = Array.isArray(sourceAnalysis?.items) ? sourceAnalysis.items : []
  const analysisStatus = String(sourceAnalysis?.status || '')
  const analysisBadge = analysisStatus === 'ok'
    ? '<span class="badge" style="background:#e7f7ee;color:#1a8a4e">AI分析完成</span>'
    : analysisStatus === 'error'
      ? '<span class="badge" style="background:#fdeaea;color:#e5484d">AI分析失败</span>'
      : analysisStatus === 'no-candidates'
        ? '<span class="badge" style="background:#fff7e6;color:#ad6800">未识别候选</span>'
        : ''
  const analysisHtml = sourceAnalysis ? `
      <div class="card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
          <h3 style="margin:0">AI来源地址 / 列表页分析</h3>
          ${analysisBadge}
        </div>
        <p style="color:var(--muted);font-size:13px;line-height:1.8;margin:8px 0">
          ${escapeHtml(String(sourceAnalysis.summary || ''))}
          ${sourceAnalysis.updatedAt ? '<br>分析时间：' + escapeHtml(String(sourceAnalysis.updatedAt)) : ''}
        </p>
        ${analysisItems.length ? `
          <table style="margin-top:10px">
            <thead><tr><th>候选标题</th><th>链接</th><th>证据摘录</th><th>置信度</th><th>操作</th></tr></thead>
            <tbody>
              ${analysisItems.map((item: any, i: number) => `
                <tr>
                  <td>${escapeHtml(String(item?.title || ''))}</td>
                  <td style="max-width:280px;word-break:break-all"><a href="${escapeHtml(String(item?.link || ''))}" target="_blank" rel="nofollow noopener">${escapeHtml(String(item?.link || ''))}</a></td>
                  <td style="max-width:420px;font-size:12px;line-height:1.6">${escapeHtml(String(item?.evidence || ''))}</td>
                  <td>${Math.round(Number(item?.confidence || 0) * 100)}%</td>
                  <td>
                    <form method="post" action="${'/admin/news-sources/' + source.id + '/analyze-publish'}" style="display:inline">
                      <input type="hidden" name="candidate_index" value="${i}" />
                      <button class="btn secondary" type="submit" onclick="return confirm('将重新抓取这条候选详情页，由 AI 生成独立解读并进入待审核；管理员人工审核通过后才会公开。确认继续？')">🤖 AI整理并进入待审核</button>
                    </form>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>` : '<p style="color:var(--muted);font-size:13px">没有可靠候选链接。系统不会因为 AI 无法确认来源而编造文章。</p>'}
      </div>` : ''
  return c.html(renderAdminLayout({
    title: '修改新闻来源',
    active: '/admin/news-sources',
    body: `
      <div class="section-title">
        <h2>修改新闻来源</h2>
        <a href="/admin/news-sources" style="color:var(--muted);font-size:13px">← 返回新闻采集管理</a>
      </div>
      <p style="color:var(--muted);font-size:13px;line-height:1.8">
        修改后，下次“立即抓取”会使用新的来源地址。来源地址可以是新闻列表页、RSS/Atom 或 JSON 接口；系统会先尝试直连与 Reader，再在列表页结构异常时让 AI 分析“已抓取页面快照”，识别标题、真实文章链接和页面证据；详情页再单独抓取。AI 不能凭空联网或猜造 URL。
      </p>
      ${c.req.query('analyzing') === '1' ? '<div class="card" style="border-left:4px solid #1677ff;color:#1677ff;margin-bottom:12px">AI来源分析已启动。刷新本页查看分析结果。</div>' : ''}
      ${c.req.query('publishing') === '1' ? '<div class="card" style="border-left:4px solid #1a8a4e;color:#1a8a4e;margin-bottom:12px">已启动“AI整理并进入待审核”。系统会重新抓取候选详情页并生成草稿；通过质量门槛后仍需人工审核。结果请到“采集日志”和“已采集文章”查看。</div>' : ''}
      ${c.req.query('error') ? '<div class="card" style="border-left:4px solid #e5484d;color:#c92a2a;margin-bottom:12px">' + escapeHtml(c.req.query('error') || '') + '</div>' : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <form method="post" action="/admin/news-sources/${id}/analyze" style="display:inline">
          <button class="btn secondary" type="submit">🤖 AI分析来源地址 / 列表页</button>
        </form>
      </div>
      <form class="admin-form" method="post" action="/admin/news-sources/${id}/edit">
        <label>来源名称</label>
        <input name="name" value="${escapeHtml(String(source.name || ''))}" maxlength="120" required />
        <label>来源地址 / 新闻列表页</label>
        <input name="feed_url" type="url" value="${escapeHtml(String(source.feed_url || ''))}" required />
        <label>可信度</label>
        <select name="credibility">
          ${['高','中','低'].map((v) => `<option value="${v}" ${String(source.credibility || '中') === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <label><input type="checkbox" name="is_active" ${Number(source.is_active) ? 'checked' : ''} /> 启用这个采集源</label>
        <button class="btn" type="submit">保存来源设置</button>
      </form>
      ${analysisHtml}
    `,
  }))
})

adminRoutes.post('/news-sources/:id/edit', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  const current = await c.env.DB.prepare('SELECT * FROM news_sources WHERE id=? LIMIT 1').bind(id).first() as any
  if (!current) return c.notFound()

  const b = await c.req.parseBody()
  const name = String(b.name || '').trim().slice(0, 120)
  const feedUrl = String(b.feed_url || '').trim()
  const credibility = String(b.credibility || '中').trim()
  const isActive = b.is_active ? 1 : 0
  if (!name) return c.text('请填写来源名称', 400)
  let parsedUrl: URL
  try {
    parsedUrl = new URL(feedUrl)
  } catch {
    return c.text('来源地址必须是完整的 http:// 或 https:// 地址', 400)
  }
  if (!/^https?:$/.test(parsedUrl.protocol)) return c.text('来源地址必须使用 http:// 或 https://', 400)
  if (!['高', '中', '低'].includes(credibility)) return c.text('可信度只能填写 高 / 中 / 低', 400)

  const duplicate = await c.env.DB.prepare('SELECT id FROM news_sources WHERE feed_url=? AND id<>? LIMIT 1')
    .bind(parsedUrl.href, id).first()
  if (duplicate) return c.text('这个来源地址已经被其他采集源使用，请换一个地址', 409)

  try {
    await c.env.DB.prepare(
      "UPDATE news_sources SET name=?, feed_url=?, credibility=?, is_active=?, last_fetched_at=CASE WHEN feed_url=? THEN last_fetched_at ELSE NULL END WHERE id=?"
    ).bind(name, parsedUrl.href, credibility, isActive, parsedUrl.href, id).run()
  } catch (e) {
    console.error('update news source failed', e)
    return c.text(errorMessage(e, '修改新闻来源失败'), 500)
  }
  return c.redirect('/admin/news-sources')
})

adminRoutes.post('/news-sources/new', async (c) => {
  const b = await c.req.parseBody()
  const name = String(b.name || '').trim().slice(0, 120)
  const feedUrl = String(b.feed_url || '').trim()
  const credibility = String(b.credibility || '中').trim()
  if (!name) return c.text('请填写来源名称', 400)
  let parsedUrl: URL
  try {
    parsedUrl = new URL(feedUrl)
  } catch {
    return c.text('来源地址必须是完整的 http:// 或 https:// 地址', 400)
  }
  if (!/^https?:$/.test(parsedUrl.protocol)) {
    return c.text('来源地址必须使用 http:// 或 https://', 400)
  }
  if (!['高', '中', '低'].includes(credibility)) {
    return c.text('可信度只能填写 高 / 中 / 低', 400)
  }
  const exists = await c.env.DB.prepare('SELECT id FROM news_sources WHERE feed_url=? LIMIT 1').bind(parsedUrl.href).first()
  if (exists) return c.text('这个来源地址已经添加过，请直接使用现有来源或换一个列表页地址', 409)
  try {
    await c.env.DB.prepare('INSERT INTO news_sources (name, feed_url, credibility) VALUES (?, ?, ?)')
      .bind(name, parsedUrl.href, credibility).run()
  } catch (e) {
    console.error('create news source failed', e)
    return c.text(errorMessage(e, '添加新闻来源失败'), 500)
  }
  return c.redirect('/admin/news-sources')
})

adminRoutes.post('/news-sources/:id/delete', async (c) => {
  await c.env.DB.prepare('DELETE FROM news_sources WHERE id=?').bind(c.req.param('id')).run()
  return c.redirect('/admin/news-sources')
})

// ---- 客户留言 ----
adminRoutes.get('/messages', async (c) => {
  const statusFilter = c.req.query('status')
  const where = statusFilter ? 'WHERE m.status = ?' : ''
  const stmt = c.env.DB.prepare(
    `SELECT m.*,
            (SELECT COUNT(*) FROM message_replies r WHERE r.message_id=m.id) AS reply_count
       FROM messages m ${where}
      ORDER BY m.created_at DESC
      LIMIT 200`,
  )
  const rows = (statusFilter ? await stmt.bind(statusFilter).all() : await stmt.all()).results as any[]
  
  if (rows.length) {
    const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0)
    if (ids.length) {
      const byMessage = new Map<number, any[]>()
      for (let i = 0; i < ids.length; i += 90) {
        const part = ids.slice(i, i + 90)
        const marks = part.map(() => '?').join(',')
        const replyRows = (await c.env.DB.prepare(
          `SELECT id, message_id, content, channel, operator, created_at
             FROM message_replies
            WHERE message_id IN (${marks})
            ORDER BY created_at ASC, id ASC`,
        ).bind(...part).all()).results as any[]
        for (const reply of replyRows as any[]) {
          const key = Number(reply.message_id)
          const list = byMessage.get(key) || []
          if (list.length < 30) list.push(reply)
          byMessage.set(key, list)
        }
      }
      for (const row of rows) row.replies = byMessage.get(Number(row.id)) || []
    }
  }
  const message = c.req.query('error')
    || (c.req.query('replied') === '1' ? '回复已保存，并已将该留言标记为“已回复”。' : '')
  return c.html(renderMessagesList(rows, statusFilter, message))
})

adminRoutes.post('/messages/:id/read', async (c) => {
  await c.env.DB.prepare("UPDATE messages SET status='read' WHERE id=? AND status='new'").bind(c.req.param('id')).run()
  return c.redirect('/admin/messages')
})

adminRoutes.post('/messages/:id/reply', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()

  const message = await c.env.DB.prepare('SELECT id, email, name FROM messages WHERE id=? LIMIT 1').bind(id).first()
  if (!message) return c.notFound()

  const body = await c.req.parseBody()
  const content = String(body.content || '').trim().slice(0, 3000)
  const allowedChannels = new Set(['邮箱', '电话', '微信', 'QQ', '其他', '内部记录'])
  const requestedChannel = String(body.channel || '')
  const channel = allowedChannels.has(requestedChannel) ? requestedChannel : '内部记录'
  if (!content) {
    return c.redirect('/admin/messages?error=' + encodeURIComponent('回复内容不能为空'))
  }

  const admin = await getCurrentAdmin(c)
  const operator = String(admin?.email || '管理员').slice(0, 200)

  try {
    if (channel === '邮箱') {
      const email = String((message as any)?.email || '').trim().toLowerCase()
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return c.redirect('/admin/messages?error=' + encodeURIComponent('该留言没有有效客户邮箱，无法发送邮箱回复'))
      }
      const settings = await readSettingsMap(c.env)
      const subject = String(body.subject || '').trim().slice(0, 200) || ((settings.site_name || '网站') + ' 回复您的留言')
      const sent = await sendCustomerReplyEmail(c.env, { to: email, subject, content })
      if (!sent.ok) {
        return c.redirect('/admin/messages?error=' + encodeURIComponent('邮箱发送失败：' + String(sent.error || '未知错误')))
      }
    }

    await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO message_replies (message_id, content, channel, operator) VALUES (?, ?, ?, ?)'
      ).bind(id, content, channel, operator),
      c.env.DB.prepare("UPDATE messages SET status='replied' WHERE id=?").bind(id),
    ])
  } catch (e) {
    console.error('save customer message reply failed', e)
    return c.redirect('/admin/messages?error=' + encodeURIComponent('回复保存失败，请确认已完成数据库迁移：' + errorMessage(e, '未知错误')))
  }

  return c.redirect('/admin/messages?replied=1')
})

adminRoutes.post('/messages/:id/delete', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  try {
    // 显式删除回复，确保即使 D1 外键级联未启用也不会留下孤立回复。
    await c.env.DB.prepare('DELETE FROM message_replies WHERE message_id=?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM messages WHERE id=?').bind(id).run()
  } catch (e) {
    console.error('delete customer message failed', e)
    return c.text('删除留言失败', 500)
  }
  return c.redirect('/admin/messages')
})

// ---- 全站自动 SEO：补齐 SEO 字段并统一页面主题词数量 ----
adminRoutes.post('/seo/auto-fill', async (c) => {
  const siteName = c.env.SITE_NAME || '网站内容平台'
  try {
    const [cityResult, serviceResult, articleResult] = await Promise.all([
      c.env.DB.prepare(
        `UPDATE cities SET
          seo_title = CASE
            WHEN TRIM(COALESCE(seo_title,'')) = '' OR length(seo_title) > 120 THEN substr(name || '服务_解决方案_流程指南 - ' || ?, 1, 120)
            ELSE seo_title
          END,
          seo_description = CASE
            WHEN TRIM(COALESCE(seo_description,'')) = '' OR length(seo_description) > 180 THEN substr(name || '围绕当前站点行业主题提供服务范围、办理流程、准备资料和风险提醒。', 1, 180)
            ELSE seo_description
          END
         WHERE is_active=1`
      ).bind(siteName).run(),
      c.env.DB.prepare(
        `UPDATE services SET
          seo_title = CASE
            WHEN TRIM(COALESCE(seo_title,'')) = '' OR length(seo_title) > 120 THEN substr(name || ' - ' || ?, 1, 120)
            ELSE seo_title
          END,
          seo_description = CASE
            WHEN TRIM(COALESCE(seo_description,'')) = '' OR length(seo_description) > 180 THEN substr(name || '专业服务，提供合规、清晰、可执行的办理支持。' || COALESCE(NULLIF(summary,''),'围绕企业实际业务场景提供流程、材料说明和风险提醒。'), 1, 180)
            ELSE seo_description
          END
         WHERE is_active=1`
      ).bind(siteName).run(),
      c.env.DB.prepare(
        `UPDATE articles SET
          seo_title = CASE
            WHEN TRIM(COALESCE(seo_title,'')) = '' OR length(seo_title) > 120 THEN substr(title || ' - ' || ?,1,120)
            ELSE seo_title
          END,
          seo_description = CASE
            WHEN TRIM(COALESCE(seo_description,'')) = '' OR length(COALESCE(seo_description,'')) > 180 THEN substr(COALESCE(NULLIF(summary,''), title || '相关行业政策与实务解读。'),1,180)
            ELSE seo_description
          END
         WHERE status='published'`
      ).bind(siteName).run(),
    ])
    const synced = await syncPageSeoKeywords(c.env)
    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    const c1 = Number((cityResult as any)?.meta?.changes || 0)
    const c2 = Number((serviceResult as any)?.meta?.changes || 0)
    const c3 = Number((articleResult as any)?.meta?.changes || 0)
    return c.redirect('/admin/keywords?message=' + encodeURIComponent('已补齐内容页 SEO 元数据：城市 ' + c1 + '、服务 ' + c2 + '、文章 ' + c3 + ' 条；并统一页面主题词为 3-5 个。不会修改固定候选词库、Sitemap、Robots、GEO 或正文。'))
  } catch (e) {
    console.error('seo auto-fill failed', e)
    return c.redirect('/admin/keywords?error=' + encodeURIComponent('全部页面 SEO 规范失败：' + errorMessage(e, '未知错误')))
  }
})

// ---- GEO / AI 搜索 ----
adminRoutes.get('/geo', async (c) => {
  const rows = (await c.env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('geo_ai_crawlers_enabled','geo_llms_enabled')").all()).results as any[]
  const map = new Map(rows.map((row) => [String(row.key), String(row.value || '')]))
  return c.html(renderGeoPage({
    siteUrl: resolveSiteUrl(c),
    aiCrawlersEnabled: map.get('geo_ai_crawlers_enabled') !== '0',
    llmsEnabled: map.get('geo_llms_enabled') !== '0',
    saved: c.req.query('saved') === '1',
  }))
})

adminRoutes.post('/geo', async (c) => {
  const b = await c.req.parseBody()
  await saveSetting(c.env, 'geo_ai_crawlers_enabled', b.geo_ai_crawlers_enabled === 'on' ? '1' : '0')
  await saveSetting(c.env, 'geo_llms_enabled', b.geo_llms_enabled === 'on' ? '1' : '0')
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/geo?saved=1')
})

// ---- 国内内容分发总览 ----
adminRoutes.get('/social', async (c) => {
  const rows = (await c.env.DB.prepare(
    "SELECT a.id, a.title, a.published_at, " +
    "MAX(CASE WHEN s.platform='douyin' THEN s.status ELSE 'not_synced' END) AS douyin_status, " +
    "MAX(CASE WHEN s.platform='kuaishou' THEN s.status ELSE 'not_synced' END) AS kuaishou_status, " +
    "MAX(CASE WHEN s.platform='xiaohongshu' THEN s.status ELSE 'not_synced' END) AS xiaohongshu_status, " +
    "MAX(CASE WHEN s.platform='bilibili' THEN s.status ELSE 'not_synced' END) AS bilibili_status " +
    "FROM articles a LEFT JOIN social_posts s ON s.article_id=a.id " +
    "WHERE a.status='published' GROUP BY a.id ORDER BY a.published_at DESC, a.id DESC LIMIT 100"
  ).all()).results as any[]
  return c.html(renderSocialDistributionPage(rows, PLATFORM_LIST))
})

// ---- SEO / 搜索引擎推送 ----
adminRoutes.get('/seo', async (c) => {
  const engine = String(c.req.query('engine') || '').trim()
  const result = String(c.req.query('result') || '').trim()
  const q = String(c.req.query('q') || '').trim()
  const where: string[] = []
  const params: string[] = []
  const channelSettings = (await c.env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('indexnow_key','baidu_token','so_token','sogou_token')"
  ).all()).results as any[]
  const settingMap = new Map(channelSettings.map((row) => [String(row.key), String(row.value || '')]))
  const channels = {
    indexnow: !!(await getIndexNowKey(c.env)),
    bing: !!(await getIndexNowKey(c.env)),
    baidu: !!settingMap.get('baidu_token'),
    '360': !!settingMap.get('so_token'),
    sogou: !!settingMap.get('sogou_token'),
    google: await hasProtectedSecret(c.env, 'GOOGLE_SERVICE_ACCOUNT_JSON') || !!String(c.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim(),
  }
  if (engine) { where.push('engine = ?'); params.push(engine) }
  if (q) { const like = '%' + escapeLike(q) + '%'; where.push(`(url LIKE ? ESCAPE char(92) OR response LIKE ? ESCAPE char(92) OR CAST(status_code AS TEXT) LIKE ? ESCAPE char(92))`); params.push(like, like, like) }
  if (result === 'success') where.push('status_code >= 200 AND status_code < 300')
  else if (result === 'failure') where.push('(status_code IS NULL OR status_code < 200 OR status_code >= 300)')
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const countRow = await c.env.DB.prepare(`SELECT
    SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) AS success_count,
    SUM(CASE WHEN status_code IS NULL OR status_code < 200 OR status_code >= 300 THEN 1 ELSE 0 END) AS failure_count
    FROM submit_logs ${clause}`).bind(...params).first() as any
  const logs = (await c.env.DB.prepare(`SELECT * FROM submit_logs ${clause} ORDER BY created_at DESC LIMIT 100`).bind(...params).all()).results
  return c.html(renderSeoPage({
    siteUrl: resolveSiteUrl(c), recentLogs: logs as any,
    successCount: Number(countRow?.success_count || 0), failureCount: Number(countRow?.failure_count || 0),
    engine, result, q, channels,
    notifyStarted: c.req.query('notify') === '1',
    notifyCount: Number(c.req.query('notify_count') || 0),
  }))
})

adminRoutes.post('/seo/logs/:id/retry', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  const log = await c.env.DB.prepare('SELECT id, url, status_code, response FROM submit_logs WHERE id=? LIMIT 1').bind(id).first() as any
  if (!log) return c.notFound()

  const status = Number(log.status_code || 0)
  const skipped = status === 0 && /(基础模板|不调用|不重复调用|请在|手动)/.test(String(log.response || ''))
  if (skipped) return c.redirect('/admin/seo?result=failure&q=' + encodeURIComponent(String(log.url || '')) + '&retry=skipped')
  const url = String(log.url || '').trim()
  if (!/^https?:\/\//i.test(url)) return c.redirect('/admin/seo?result=failure&retry=invalid')
  const siteUrl = resolveSiteUrl(c)
  c.executionCtx.waitUntil(submitAllEngines(c.env, [url], siteUrl).catch((e) => console.error('SEO log retry failed', { id, url, error: String(e) })))
  return c.redirect('/admin/seo?notify=1&notify_count=1&retry=1&q=' + encodeURIComponent(url))
})

adminRoutes.post('/seo/logs/:id/delete', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  await c.env.DB.prepare('DELETE FROM submit_logs WHERE id=?').bind(id).run()
  return c.redirect('/admin/seo')
})

adminRoutes.post('/seo/submit', async (c) => {
  const siteUrl = resolveSiteUrl(c)
  const urls = await getAllPublishedUrls(c.env, siteUrl)
  const unique = Array.from(new Set(urls))
  c.executionCtx.waitUntil(
    submitAllEngines(c.env, unique, siteUrl).catch((e) => console.error('manual SEO submission failed', e))
  )
  return c.redirect('/admin/seo?notify=1&notify_count=' + unique.length)
})

// ---- R2 媒体库：直接读取 R2，包含历史上传的页面图片、二维码和媒体文件 ----
const MEDIA_MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
}

function mediaPublicUrl(objectKey: string): string {
  return '/media/' + objectKey.slice('media/'.length)
}

function mediaSafeKey(raw: unknown): string {
  const key = String(raw || '').trim()
  if (!key || !key.startsWith('media/') || key.includes('..')) return ''
  return key
}

async function detachDeletedMediaReferences(c: any, objectKey: string): Promise<void> {
  const publicUrl = mediaPublicUrl(objectKey)
  const settings = await readSettingsMap(c.env)
  let settingsChanged = false

  if (String(settings.contact_qr_url || '').trim() === publicUrl) {
    await c.env.DB.prepare("DELETE FROM settings WHERE key='contact_qr_url'").run()
    settingsChanged = true
  }

  const store = getImageStore(settings)
  let imageChanged = false
  if (store.home?.key === objectKey || store.home?.url === publicUrl) {
    delete store.home
    imageChanged = true
  }
  for (const group of ['cities', 'services'] as const) {
    for (const [slug, entry] of Object.entries(store[group])) {
      if (entry?.key === objectKey || entry?.url === publicUrl) {
        delete store[group][slug]
        imageChanged = true
      }
    }
  }
  if (imageChanged) {
    await saveSetting(c.env, 'image_settings_json', saveImageStore(store))
    settingsChanged = true
  }

  if (settingsChanged) {
    await purgeCacheAll(c.executionCtx)
  }
}

async function permanentlyDeleteMediaObject(c: any, objectKey: string): Promise<boolean> {
  const key = mediaSafeKey(objectKey)
  if (!key) return false
  try {
    const existing = await c.env.R2_MEDIA.head(key)
    if (!existing) {
      await c.env.DB.prepare('DELETE FROM media_assets WHERE object_key=?').bind(key).run()
      return false
    }
    await c.env.R2_MEDIA.delete(key)
    await c.env.DB.prepare('DELETE FROM media_assets WHERE object_key=?').bind(key).run()
    await detachDeletedMediaReferences(c, key)
    await purgeCacheTags(c.executionCtx, [mediaCacheTag(key)])
    return true
  } catch (e) {
    console.error('permanent media delete failed', key, e)
    return false
  }
}

adminRoutes.get('/media', async (c) => {
  const [listed, trackedResult] = await Promise.all([
    c.env.R2_MEDIA.list({ prefix: 'media/', limit: 1000 }),
    c.env.DB.prepare('SELECT object_key, original_name, content_type FROM media_assets').all(),
  ])
  const tracked = new Map<string, any>()
  for (const row of trackedResult.results as any[]) tracked.set(String(row.object_key), row)

  const rows = (listed.objects || []).map((object: any) => {
    const key = String(object.key || '')
    const meta = tracked.get(key)
    const name = String(meta?.original_name || key.split('/').pop() || key)
    const ext = (key.split('.').pop() || '').toLowerCase()
    return {
      id: meta?.id ? Number(meta.id) : '',
      object_key: key,
      original_name: name,
      content_type: String(meta?.content_type || MEDIA_MIME_BY_EXT[ext] || 'application/octet-stream'),
      size: Number(object.size || 0),
      uploaded_at: object.uploaded ? new Date(object.uploaded).toISOString() : '',
      r2_only: !meta,
    }
  })
  rows.sort((a: any, b: any) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)))
  const total = rows.length
  const totalLabel = listed.truncated ? String(total) + '+' : String(total)
  return c.html(renderMediaPage(rows.slice(0, 1000), totalLabel as any, c.req.query('error') || ''))
})

adminRoutes.post('/media/upload', async (c) => {
  const maxBytes = 10 * 1024 * 1024
  const contentLength = Number(c.req.header('content-length') || 0)
  if (contentLength && contentLength > maxBytes + 256 * 1024) {
    return c.redirect('/admin/media?error=' + encodeURIComponent('单文件最大 10MB'))
  }
  const body = await c.req.parseBody({ all: true })
  const fileValue = body.file
  const file = fileValue instanceof File ? fileValue : null
  if (!file || !file.name) return c.redirect('/admin/media?error=' + encodeURIComponent('请选择文件'))
  if (file.size > maxBytes) return c.redirect('/admin/media?error=' + encodeURIComponent('单文件最大 10MB'))
  const allowed = /^(image\/(jpeg|png|webp|gif|svg\+xml)|application\/pdf)$/.test(file.type)
  if (!allowed) return c.redirect('/admin/media?error=' + encodeURIComponent('仅支持 JPG、PNG、WEBP、GIF、SVG、PDF'))

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'bin'
  const objectKey = 'media/' + new Date().toISOString().slice(0, 10) + '/' + crypto.randomUUID() + '.' + ext
  const object = await c.env.R2_MEDIA.put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream', contentDisposition: 'inline' },
    customMetadata: { originalName: file.name },
  })
  await c.env.DB.prepare(
    'INSERT INTO media_assets (object_key, original_name, content_type, size, etag) VALUES (?, ?, ?, ?, ?)'
  ).bind(objectKey, file.name, file.type || 'application/octet-stream', file.size, object?.etag || null).run()
  return c.redirect('/admin/media')
})

adminRoutes.post('/media/:id/delete', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.notFound()
  const row = await c.env.DB.prepare('SELECT object_key FROM media_assets WHERE id=?').bind(id).first() as any
  if (row) await permanentlyDeleteMediaObject(c, String(row.object_key))
  c.header('Cache-Control', 'no-store')
  await purgeCacheAll(c.executionCtx)
  return c.redirect('/admin/media')
})

adminRoutes.post('/media/delete-one', async (c) => {
  const body = await c.req.parseBody()
  const key = mediaSafeKey(body.object_key)
  if (!key) return c.redirect('/admin/media?error=' + encodeURIComponent('媒体文件地址无效'))
  const ok = await permanentlyDeleteMediaObject(c, key)
  if (!ok) return c.redirect('/admin/media?error=' + encodeURIComponent('文件不存在或删除失败，请重新加载后重试'))
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/media')
})

adminRoutes.post('/media/delete-selected', async (c) => {
  const body = await c.req.parseBody({ all: true })
  const raw = body.keys
  const keys = Array.from(new Set((Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map((v) => mediaSafeKey(v))
    .filter(Boolean)
    .slice(0, 25)))
  if (!keys.length) return c.redirect('/admin/media?error=' + encodeURIComponent('请先选择要删除的文件'))

  let deleted = 0
  for (const key of keys) {
    if (await permanentlyDeleteMediaObject(c, key)) deleted++
  }
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/media' + (deleted ? '' : '?error=' + encodeURIComponent('没有文件被删除，请重新加载媒体库后重试')))
})

// ---- 生产库资源清理：每次 HTTP 调用只处理一个小批次，浏览器连续调用，降低 1101/1102 风险 ----
adminRoutes.post('/production-cleanup', async (c) => {
  const body = await c.req.parseBody()
  const scope = String(body.scope || '').trim()
  const phase = String(body.phase || 'd1').trim()
  const cursor = String(body.cursor || '').trim()
  const allowed = new Set(['articles', 'news', 'cities', 'services', 'keywords', 'r2', 'kv', 'all', 'cache'])
  if (!allowed.has(scope)) return c.json({ ok: false, error: '无效清理范围' }, 400)

  try {
    const result: Record<string, any> = { ok: true, scope, phase, deleted: 0, complete: true, nextPhase: 'done', nextCursor: '' }

    if (scope === 'cache') {
      result.cachePurged = await purgeCacheEverything(c.executionCtx)
      result.complete = true
    } else if (scope === 'all' && (phase === 'd1' || phase.startsWith('d1:'))) {
      const table = phase === 'd1' ? 'social_posts' : phase.slice(3)
      if (table === '__production_settings__') {
        const settingsBatch = await deleteProductionSettingsBatch(c.env, 'ai_page', 25)
        result.deleted = settingsBatch.deleted
        result.complete = settingsBatch.complete
        result.nextPhase = settingsBatch.complete ? 'generated-meta' : 'd1:__production_settings__'
      } else if (table === '__generated_meta__') {
        const settingsBatch = await deleteProductionSettingsBatch(c.env, 'generated_meta', 25)
        result.deleted = settingsBatch.deleted
        result.complete = settingsBatch.complete
        result.nextPhase = settingsBatch.complete ? 'r2' : 'generated-meta'
      } else {
        const batch = await deleteProductionD1Batch(c.env, table, 25)
        result.deleted = batch.deleted
        if (batch.deleted > 0) {
          result.complete = false
          result.nextPhase = 'd1:' + batch.nextTable
        } else if (batch.nextTable === '__production_settings__') {
          result.complete = false
          result.nextPhase = 'd1:__production_settings__'
        } else {
          result.complete = false
          result.nextPhase = 'd1:' + batch.nextTable
        }
      }
    } else if (scope === 'articles') {
      const rows = (await c.env.DB.prepare('SELECT id FROM articles ORDER BY id LIMIT 10').all()).results as any[]
      if (rows.length) {
        const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))
        const placeholders = ids.map(() => '?').join(',')
        await c.env.DB.batch([
          c.env.DB.prepare(`DELETE FROM social_posts WHERE article_id IN (${placeholders})`).bind(...ids),
          c.env.DB.prepare(`DELETE FROM review_logs WHERE article_id IN (${placeholders})`).bind(...ids),
          c.env.DB.prepare(`DELETE FROM articles WHERE id IN (${placeholders})`).bind(...ids),
        ])
        await removePageContact(c.env, ids.map((id) => 'article:' + id))
        result.deleted = rows.length
        result.complete = rows.length < 10
      }
    } else if (scope === 'news') {
      if (phase === 'd1') {
        const rows = (await c.env.DB.prepare("SELECT id FROM articles WHERE ai_generated=1 ORDER BY id LIMIT 10").all()).results as any[]
        if (rows.length) {
          const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))
          const placeholders = ids.map(() => '?').join(',')
          await c.env.DB.batch([
            c.env.DB.prepare(`DELETE FROM social_posts WHERE article_id IN (${placeholders})`).bind(...ids),
            c.env.DB.prepare(`DELETE FROM review_logs WHERE article_id IN (${placeholders})`).bind(...ids),
            c.env.DB.prepare(`DELETE FROM articles WHERE id IN (${placeholders})`).bind(...ids),
          ])
          await removePageContact(c.env, ids.map((id) => 'article:' + id))
          result.deleted = rows.length
          result.complete = false
          result.nextPhase = 'd1'
        } else {
          result.complete = false
          result.nextPhase = 'meta'
        }
      } else if (phase === 'meta') {
        await c.env.DB.batch([
          c.env.DB.prepare('DELETE FROM collection_logs'),
          c.env.DB.prepare('DELETE FROM news_sources'),
        ])
        result.complete = true
      }
    } else if (scope === 'cities') {
      if (phase === 'd1') {
        const rows = (await c.env.DB.prepare('SELECT id, slug FROM cities ORDER BY id LIMIT 10').all()).results as any[]
        if (rows.length) {
          const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))
          const slugs = rows.map((row) => String(row.slug || '').trim()).filter(Boolean)
          const placeholders = ids.map(() => '?').join(',')
          await c.env.DB.batch([
            c.env.DB.prepare(`DELETE FROM social_posts WHERE article_id IN (SELECT id FROM articles WHERE city_id IN (${placeholders}) AND ai_generated=1)`).bind(...ids),
            c.env.DB.prepare(`DELETE FROM review_logs WHERE article_id IN (SELECT id FROM articles WHERE city_id IN (${placeholders}) AND ai_generated=1)`).bind(...ids),
            c.env.DB.prepare(`DELETE FROM articles WHERE city_id IN (${placeholders}) AND ai_generated=1`).bind(...ids),
            c.env.DB.prepare(`UPDATE articles SET city_id=NULL WHERE city_id IN (${placeholders})`).bind(...ids),
            c.env.DB.prepare(`DELETE FROM keywords WHERE city_id IN (${placeholders})`).bind(...ids),
            c.env.DB.prepare(`DELETE FROM cities WHERE id IN (${placeholders})`).bind(...ids),
            c.env.DB.prepare(`DELETE FROM settings WHERE key IN (${slugs.map(() => '?').join(',')})`).bind(...slugs.map((slug) => aiContentSettingKey('cities', slug))),
          ])
          await removePageContact(c.env, slugs.map((slug) => 'city:' + slug))
          result.deleted = rows.length
          result.complete = false
          result.nextPhase = 'd1'
        } else {
          await removeImageStoreGroup(c.env, 'cities')
          result.complete = false
          result.nextPhase = 'r2'
        }
      } else if (phase === 'r2') {
        const batch = await deleteR2PrefixBatch(c.env, 'media/pages/city/', cursor, 25)
        result.deleted = batch.deleted
        result.complete = batch.complete
        result.nextPhase = batch.complete ? 'done' : 'r2'
        result.nextCursor = batch.nextCursor
      }
    } else if (scope === 'services') {
      if (phase === 'd1') {
        const rows = (await c.env.DB.prepare('SELECT id, slug FROM services ORDER BY id LIMIT 10').all()).results as any[]
        if (rows.length) {
          const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))
          const slugs = rows.map((row) => String(row.slug || '').trim()).filter(Boolean)
          const placeholders = ids.map(() => '?').join(',')
          await c.env.DB.batch([
            c.env.DB.prepare(`DELETE FROM keywords WHERE service_id IN (${placeholders})`).bind(...ids),
            c.env.DB.prepare(`DELETE FROM services WHERE id IN (${placeholders})`).bind(...ids),
            c.env.DB.prepare(`DELETE FROM settings WHERE key IN (${slugs.map(() => '?').join(',')})`).bind(...slugs.map((slug) => aiContentSettingKey('services', slug))),
          ])
          await removePageContact(c.env, slugs.map((slug) => 'service:' + slug))
          result.deleted = rows.length
          result.complete = false
          result.nextPhase = 'd1'
        } else {
          await removeImageStoreGroup(c.env, 'services')
          await c.env.DB.prepare("DELETE FROM settings WHERE key='service_external_links'").run()
          result.complete = false
          result.nextPhase = 'r2'
        }
      } else if (phase === 'r2') {
        const batch = await deleteR2PrefixBatch(c.env, 'media/pages/service/', cursor, 25)
        result.deleted = batch.deleted
        result.complete = batch.complete
        result.nextPhase = batch.complete ? 'done' : 'r2'
        result.nextCursor = batch.nextCursor
      }
    } else if (scope === 'keywords') {
      if (phase === 'd1') {
        const resultBatch = await deleteProductionD1Batch(c.env, 'keywords', 25)
        result.deleted = resultBatch.deleted
        result.complete = resultBatch.deleted === 0
        result.nextPhase = result.complete ? 'landing-meta' : 'd1:keywords'
      } else if (phase === 'landing-meta') {
        const settingsBatch = await deleteProductionSettingsBatch(c.env, 'ai_page', 25)
        result.deleted = settingsBatch.deleted
        result.complete = settingsBatch.complete
        result.nextPhase = settingsBatch.complete ? 'done' : 'landing-meta'
      }
    } else if (scope === 'r2') {
      if (phase === 'd1') {
        await c.env.DB.batch([
          c.env.DB.prepare('DELETE FROM media_assets'),
          c.env.DB.prepare("DELETE FROM settings WHERE key IN ('image_settings_json','contact_qr_url')"),
        ])
        result.complete = false
        result.nextPhase = 'r2'
      } else {
        const batch = await deleteR2PrefixBatch(c.env, 'media/', cursor, 25)
        result.deleted = batch.deleted
        result.complete = batch.complete
        result.nextPhase = batch.complete ? 'done' : 'r2'
        result.nextCursor = batch.nextCursor
      }
    } else if (scope === 'kv') {
      if (phase === 'd1') result.deleted = await clearKnownKvProbes(c.env)
      const batch = await clearTransientKvBatch(c.env, phase === 'kv' ? cursor : '', 25)
      result.deleted += batch.deleted
      result.complete = batch.complete
      result.nextPhase = batch.complete ? 'done' : 'kv'
      result.nextCursor = batch.nextCursor
    } else {
      return c.json({ ok: false, error: '无效清理阶段' }, 400)
    }

    c.header('Cache-Control', 'no-store')
    c.header('Cloudflare-CDN-Cache-Control', 'no-store')
    return c.json(result)
  } catch (e) {
    console.error('production cleanup failed', { scope, phase, cursor, error: e })
    c.header('Cache-Control', 'no-store')
    return c.json({ ok: false, error: errorMessage(e, '生产资源清理失败') }, 500)
  }
})


// ---- 系统自检：不用命令行/日志，直接在网页上确认各项绑定和配置是否正常 ----
adminRoutes.get('/system', async (c) => {
  const env = c.env
  const checks: { label: string; ok: boolean; detail: string; level?: 'warning' | 'error' }[] = []
  const probe = c.req.query('probe') === '1'

  try {
    await env.DB.prepare('SELECT 1').first()
    checks.push({ label: 'D1 数据库连接', ok: true, detail: '正常' })
  } catch (e) {
    checks.push({ label: 'D1 数据库连接', ok: false, detail: String(e) })
  }

  if (!env.CACHE_KV) {
    checks.push({ label: 'KV 缓存绑定', ok: false, detail: 'CACHE_KV 未绑定' })
  } else if (!probe) {
    checks.push({ label: 'KV 缓存绑定', ok: true, detail: '已绑定；执行完整检测才会实际读写' })
  } else {
    try {
      await env.CACHE_KV.put('__healthcheck__', '1', { expirationTtl: 60 })
      const value = await env.CACHE_KV.get('__healthcheck__')
      checks.push({ label: 'KV 缓存读写', ok: value === '1', detail: value === '1' ? '正常' : '读写值不一致' })
    } catch (e) {
      checks.push({ label: 'KV 缓存读写', ok: false, detail: String(e) })
    }
  }

  if (!env.R2_MEDIA) {
    checks.push({ label: 'R2 媒体绑定', ok: false, detail: 'R2_MEDIA 未绑定' })
  } else if (!probe) {
    checks.push({ label: 'R2 媒体绑定', ok: true, detail: '已绑定；执行完整检测才会实际写入/读取/删除' })
  } else {
    try {
      const probeKey = '__healthcheck__/' + crypto.randomUUID()
      await env.R2_MEDIA.put(probeKey, 'ok', { httpMetadata: { contentType: 'text/plain' } })
      const probeObject = await env.R2_MEDIA.head(probeKey)
      await env.R2_MEDIA.delete(probeKey)
      checks.push({ label: 'R2 媒体存储', ok: !!probeObject, detail: probeObject ? '绑定、写入、读取、删除均正常' : '写入后未找到对象' })
    } catch (e) {
      checks.push({ label: 'R2 媒体存储', ok: false, detail: String(e) })
    }
  }

  const aiSettings = await getAiSettings(env)
  if (!env.AI) {
    checks.push({ label: 'Workers AI 绑定', ok: false, detail: 'AI 未绑定' })
  } else if (!aiSettings.enabled) {
    checks.push({ label: 'Workers AI 调用', ok: true, detail: `后台已停用 AI；当前模型：${aiSettings.model}` })
  } else if (!probe) {
    checks.push({ label: 'Workers AI 绑定', ok: true, detail: `已绑定；当前模型：${aiSettings.model}；执行完整检测才会实际调用模型` })
  } else {
    try {
      const res: any = await runConfiguredAi(env, { messages: [{ role: 'user', content: '请回复"ok"两个字' }] }, aiSettings)
      if (!res) throw new Error('AI 已启用但没有返回响应')
      const responseText = res.response || res.result?.response || JSON.stringify(res)
      checks.push({ label: 'Workers AI 调用', ok: true, detail: `模型：${aiSettings.model}；响应：${String(responseText).slice(0, 60)}` })
    } catch (e) {
      checks.push({ label: 'Workers AI 调用', ok: false, detail: String(e) })
    }
  }

  if (String(env.JWT_SECRET || '').trim()) {
    checks.push({ label: 'JWT 会话密钥', ok: true, detail: '已配置 Cloudflare Worker Secret JWT_SECRET。' })
  } else {
    checks.push({
      label: 'JWT 会话密钥',
      ok: true,
      level: 'warning',
      detail: '未配置 JWT_SECRET：当前兼容模式会使用 CACHE_KV 生成随机密钥。生产环境建议在 Cloudflare Worker → Variables and Secrets 中配置 JWT_SECRET。',
    })
  }

  const siteUrl = resolveSiteUrl(c)
  const siteUrlIsFallback = !env.SITE_URL || env.SITE_URL === 'https://your-domain.com'
  checks.push({
    label: '站点地址 (SITE_URL)',
    ok: true,
    detail: siteUrlIsFallback
      ? `未手动配置，已按当前访问域名自动兜底为 ${siteUrl}（绑定自定义域名后建议在环境变量里手动改成正式域名）`
      : `已配置为 ${env.SITE_URL}`,
  })

  const indexnowKey = await getIndexNowKey(env)
  checks.push({ label: 'IndexNow Key', ok: !!indexnowKey, detail: indexnowKey ? '已配置' : '未配置，前往「系统设置」填写后即可推送百度/Bing/Yandex' })

  try {
    const adminCount = (await env.DB.prepare('SELECT COUNT(*) as n FROM admin_users').first()) as any
    checks.push({ label: '管理员账号', ok: adminCount.n > 0, detail: adminCount.n > 0 ? `已创建 ${adminCount.n} 个账号` : '尚未创建，访问 /admin/setup 初始化' })

    const newsSourceCount = (await env.DB.prepare('SELECT COUNT(*) as n FROM news_sources WHERE is_active=1').first()) as any
    checks.push({ label: '新闻采集源', ok: newsSourceCount.n > 0, detail: newsSourceCount.n > 0 ? `已启用 ${newsSourceCount.n} 个来源` : '尚未添加，前往「新闻采集管理」添加 RSS 来源后定时任务才会工作' })
  } catch (e) {
    checks.push({ label: 'D1 业务表检查', ok: false, detail: String(e) })
  }

  checks.push({
    label: 'GEO · llms.txt',
    ok: true,
    detail: `已启用，可访问 ${siteUrl}/llms.txt 查看 AI 爬虫看到的站点摘要`,
  })
  checks.push({
    label: 'GEO · AI 爬虫白名单',
    ok: true,
    detail: 'robots.txt 已显式允许 GPTBot / ClaudeBot / PerplexityBot / Google-Extended / Bingbot / Baiduspider / Bytespider 等主流AI爬虫抓取',
  })
  checks.push({
    label: 'GEO · 结构化数据',
    ok: true,
    detail: '文章页自动输出 Article 结构化数据，城市页自动输出 FAQPage 结构化数据，无需手动配置',
  })

  return c.html(renderSystemPage(checks))
})

// ---- 前台页面管理：内容、模式、外站链接统一由后台控制 ----
async function loadPageSettingsFromDb(env: Bindings) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='page_settings_json'").first() as any
  return getPageSettings(row?.value ? { page_settings_json: String(row.value) } : {})
}

adminRoutes.get('/pages', async (c) => {
  const pages = Object.values(await loadPageSettingsFromDb(c.env))
  const audit = await buildPublicSeoAudit(c.env)
  const auditByKey = new Map(audit.pages.filter((p) => p.type === 'home' || p.type === 'list').map((p) => [p.key, p.audit]))
  const pageRows = pages.map((page: any) => ({ ...page, seoAudit: auditByKey.get(page.key) || null }))
  return c.html(renderPageSettingsPage(pageRows))
})

adminRoutes.get('/pages/:key/edit', async (c) => {
  const key = c.req.param('key')
  if (!isManagedPageKey(key)) return c.notFound()
  const pages = await loadPageSettingsFromDb(c.env)
  const settings = await readSettingsMap(c.env)
  const images = getImageStore(settings)
  const pageContact = getPageContact(settings, key, getContactMethods(settings))
  const audit = await buildPublicSeoAudit(c.env)
  const currentAudit = audit.pages.find((p) => (p.type === 'home' || p.type === 'list') && p.key === key)?.audit || null
  const currentPage = { ...pages[key], seoAudit: currentAudit }
  return c.html(renderPageSettingsPage(Object.values(pages), currentPage, c.req.query('error') || '', images.home, pageContact))
})

adminRoutes.post('/pages/:key/edit', async (c) => {
  const key = c.req.param('key')
  if (!isManagedPageKey(key)) return c.notFound()
  const pages = await loadPageSettingsFromDb(c.env)
  const settings = await readSettingsMap(c.env)
  const b = await c.req.parseBody()
  const mode = b.mode === 'external' ? 'external' : b.mode === 'hidden' ? 'hidden' : 'internal'
  const externalUrl = String(b.external_url || '').trim()
  if (mode === 'external' && !isHttpUrl(externalUrl)) {
    return c.html(renderPageSettingsPage(Object.values(pages), pages[key], '外站链接必须填写有效的 http:// 或 https:// 地址'))
  }
  const clean = (v: unknown, max: number) => String(v || '').trim().slice(0, max)
  pages[key] = {
    ...pages[key],
    mode,
    labelZh: clean(b.label_zh, 60) || pages[key].labelZh,
    labelEn: clean(b.label_en, 60) || pages[key].labelEn,
    externalUrl: mode === 'external' ? externalUrl : '',
    titleZh: clean(b.title_zh, 200),
    titleEn: clean(b.title_en, 200),
    subtitleZh: clean(b.subtitle_zh, 500),
    subtitleEn: clean(b.subtitle_en, 500),
    contentZh: clean(b.content_zh, 12000),
    contentEn: clean(b.content_en, 12000),
    seoKeywordsZh: clean(b.seo_keywords_zh, 300),
    seoKeywordsEn: clean(b.seo_keywords_en, 300),
    showForm: b.show_form === 'on',
  }
  await c.env.DB.prepare("INSERT INTO settings (key, value) VALUES ('page_settings_json', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(serializePageSettings(pages)).run()
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/pages/' + key + '/edit')
})


adminRoutes.post('/pages/:key/ai-content', async (c) => {
  const key = c.req.param('key')
  if (!isManagedPageKey(key)) return c.notFound()
  const pages = await loadPageSettingsFromDb(c.env)
  const page = pages[key]
  if (page.mode !== 'internal') {
    return c.redirect('/admin/pages/' + key + '/edit?error=' + encodeURIComponent('外站链接或隐藏页面不需要生成本站 AI 内容'))
  }

  try {
    const ai = await generateAiPageContent(c.env, {
      type: 'page',
      pageLabel: page.label,
      pagePath: page.path,
      title: page.titleZh,
      summary: page.subtitleZh,
      sourceContent: page.contentZh,
    })
    if (!ai) {
      const status = await getAiRouteStatus(c.env)
      const message = status.ok ? aiEmptyResultMessage('AI页面生成', status.settings) : status.message
      return c.redirect('/admin/pages/' + key + '/edit?error=' + encodeURIComponent(message))
    }

    page.titleZh = ai.title
    page.subtitleZh = ai.summary
    page.contentZh = ai.content
    page.seoKeywordsZh = alignSeoKeywordsToContent(
      [page.labelZh, page.labelZh + '服务', page.labelZh + '办理', page.labelZh + '流程', ...normalizeKeywordCandidates((await readSettingsMap(c.env)).site_keywords || '', 15)],
      ai.title, ai.summary, ai.content, 5,
    ).join(',')
    page.aiGenerated = true
    await saveSetting(c.env, 'page_settings_json', serializePageSettings(pages))
    if (key === 'home') await saveSetting(c.env, 'site_seo_ai_generated', '1')
    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    return c.redirect('/admin/pages/' + key + '/edit?ai=1')
  } catch (e) {
    console.error('AI managed page generation failed', e)
    return c.redirect('/admin/pages/' + key + '/edit?error=' + encodeURIComponent(errorMessage(e, 'AI页面生成失败')))
  }
})

adminRoutes.post('/pages/:key/clear', async (c) => {
  const key = c.req.param('key')
  if (!isManagedPageKey(key)) return c.notFound()
  const pages = await loadPageSettingsFromDb(c.env)
  pages[key] = { ...pages[key], mode: 'internal', externalUrl: '', titleZh: '', titleEn: '', subtitleZh: '', subtitleEn: '', contentZh: '', contentEn: '', seoKeywordsZh: '', seoKeywordsEn: '', aiGenerated: false, showForm: true }
  await saveSetting(c.env, 'page_settings_json', serializePageSettings(pages))
  const settings = await readSettingsMap(c.env)
  const imageStore = getImageStore(settings)
  if (key === 'home' && imageStore.home) {
    const old = imageStore.home
    delete imageStore.home
    await saveImageStoreSetting(c.env, imageStore)
    await deletePageImage(c.env, old)
  }
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/pages/' + key + '/edit')
})

// ---- R2 页面图片管理 ----
async function saveImageStoreSetting(env: Bindings, store: ReturnType<typeof getImageStore>) {
  await saveSetting(env, 'image_settings_json', saveImageStore(store))
}

adminRoutes.post('/page-images/home', async (c) => {
  const length = Number(c.req.header('content-length') || 0)
  if (length && length > 5 * 1024 * 1024 + 256 * 1024) return c.redirect('/admin/pages/home/edit?error=' + encodeURIComponent('图片请求过大，单文件最大 5MB'))
  const body = await c.req.parseBody()
  const file = body.file instanceof File ? body.file : null
  if (!file || !file.name) return c.redirect('/admin/pages/home/edit?error=' + encodeURIComponent('请选择图片'))
  const settings = await readSettingsMap(c.env)
  const store = getImageStore(settings)
  try {
    const next = await uploadPageImage(c.env, 'home', 'home', file)
    const old = store.home
    store.home = next
    await saveImageStoreSetting(c.env, store)
    await deletePageImage(c.env, old)
    if (old?.key) c.executionCtx.waitUntil(purgeCacheTags(c.executionCtx, [mediaCacheTag(old.key)]))
    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    return c.redirect('/admin/pages/home/edit')
  } catch (e) {
    return c.redirect('/admin/pages/home/edit?error=' + encodeURIComponent(errorMessage(e)))
  }
})

adminRoutes.post('/page-images/home/delete', async (c) => {
  const settings = await readSettingsMap(c.env)
  const store = getImageStore(settings)
  const old = removeImage(store, 'home')
  await saveImageStoreSetting(c.env, store)
  await deletePageImage(c.env, old)
  if (old?.key) c.executionCtx.waitUntil(purgeCacheTags(c.executionCtx, [mediaCacheTag(old.key)]))
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/pages/home/edit')
})

for (const group of ['city', 'service'] as const) {
  adminRoutes.post('/page-images/' + group + '/:slug', async (c) => {
    const slug = String(c.req.param('slug') || '').trim()
    const editPath = group === 'city' ? '/admin/cities' : '/admin/services'
    if (!slug) return c.redirect(editPath + '?error=' + encodeURIComponent('缺少页面标识'))
    const length = Number(c.req.header('content-length') || 0)
    if (length && length > 5 * 1024 * 1024 + 256 * 1024) return c.redirect(editPath + '?error=' + encodeURIComponent('图片请求过大，单文件最大 5MB'))
    const body = await c.req.parseBody()
    const file = body.file instanceof File ? body.file : null
    if (!file || !file.name) return c.redirect(editPath + '?error=' + encodeURIComponent('请选择图片'))
    const settings = await readSettingsMap(c.env)
    const store = getImageStore(settings)
    try {
      const next = await uploadPageImage(c.env, group, slug, file)
      const bucket = group === 'city' ? store.cities : store.services
      const old = bucket[slug]
      bucket[slug] = next
      await saveImageStoreSetting(c.env, store)
      await deletePageImage(c.env, old)
      if (old?.key) c.executionCtx.waitUntil(purgeCacheTags(c.executionCtx, [mediaCacheTag(old.key)]))
      c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
      return c.redirect(editPath)
    } catch (e) {
      return c.redirect(editPath + '?error=' + encodeURIComponent(errorMessage(e)))
    }
  })

  adminRoutes.post('/page-images/' + group + '/:slug/delete', async (c) => {
    const slug = c.req.param('slug')
    const settings = await readSettingsMap(c.env)
    const store = getImageStore(settings)
    const old = removeImage(store, group === 'city' ? 'cities' : 'services', slug)
    await saveImageStoreSetting(c.env, store)
    await deletePageImage(c.env, old)
    if (old?.key) c.executionCtx.waitUntil(purgeCacheTags(c.executionCtx, [mediaCacheTag(old.key)]))
    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    return c.redirect(group === 'city' ? '/admin/cities' : '/admin/services')
  })
}

// ---- AI 设置 ----
adminRoutes.get('/ai-settings', async (c) => {
  const settings = await getAiSettings(c.env)
  const externalApiKeyConfigured = await hasProtectedSecret(c.env, 'EXTERNAL_AI_API_KEY') || !!String(c.env.EXTERNAL_AI_API_KEY || '').trim()
  return c.html(renderAiSettingsPage({
    ...settings,
    externalApiKeyConfigured,
    saved: c.req.query('saved') === '1',
    test: c.req.query('test') || '',
    testModel: c.req.query('model') || '',
    testProvider: c.req.query('provider') || '',
    testResponse: c.req.query('response') || '',
    testMessage: c.req.query('message') || '',
    testTask: c.req.query('task') || 'connectivity',
    testQuality: c.req.query('quality') || '',
  }))
})

adminRoutes.post('/ai-settings', async (c) => {
  const b = await c.req.parseBody()
  await saveAiSettings(c.env, normalizeAiSettings({
    enabled: b.ai_enabled === 'on',
    aiProvider: String(b.ai_provider || ''),
    model: String(b.ai_model || ''),
    customModel: String(b.ai_custom_model || ''),
    temperature: Number(b.ai_temperature),
    maxTokens: Number(b.ai_max_tokens),
    externalBaseUrl: String(b.ai_external_base_url || ''),
    externalModel: String(b.ai_external_model || ''),
    externalTimeoutMs: Number(b.ai_external_timeout_ms),
    fallbackEnabled: b.ai_fallback_enabled === 'on',
  }))
  const externalKey = String(b.external_ai_api_key || '').trim()
  if (externalKey) await saveProtectedSecret(c.env, 'EXTERNAL_AI_API_KEY', externalKey)
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/ai-settings?saved=1')
})

adminRoutes.post('/ai-settings/test', async (c) => {
  const settings = await getAiSettings(c.env)
  const body = await c.req.parseBody()
  const task = ['connectivity', 'city', 'article'].includes(String(body.test_task || 'connectivity')) ? String(body.test_task || 'connectivity') : 'connectivity'
  if (!settings.enabled) return c.redirect('/admin/ai-settings?test=disabled&task=' + encodeURIComponent(task))
  try {
    let responseText = ''
    let quality = ''
    if (task === 'connectivity') {
      const result: any = await runConfiguredAi(c.env, { messages: [{ role: 'user', content: '只回复 ok，不要输出其他内容。' }] }, settings)
      responseText = getAiResponseText(result).trim()
      if (!responseText) return c.redirect('/admin/ai-settings?test=empty&task=connectivity')
      quality = '通道可调用，返回文本正常'
    } else {
      const generated = await generateAiPageContent(
        c.env,
        task === 'city'
          ? { type: 'city', city: '示例城市', keywords: ['示例主题'], summary: '用于后台诊断的示例城市页面。' }
          : { type: 'article', title: '示例行业文章', summary: '用于后台诊断的示例文章。', keywords: ['示例主题'] },
        settings,
      )
      if (!generated?.content || generated.content.length < 300) throw new Error('真实内容任务返回内容过短或为空')
      responseText = [generated.title, generated.summary, generated.content].filter(Boolean).join('\n\n')
      quality = '真实内容任务通过：已得到可保存的标题、摘要和正文'
    }
    const model = settings.provider === 'workers_ai' ? settings.model : settings.externalModel
    return c.redirect('/admin/ai-settings?test=ok&task=' + encodeURIComponent(task) + '&quality=' + encodeURIComponent(quality) + '&provider=' + encodeURIComponent(settings.provider) + '&model=' + encodeURIComponent(model) + '&response=' + encodeURIComponent(responseText.slice(0, 2400)))
  } catch (e) {
    console.error('AI diagnostic test failed', e)
    return c.redirect('/admin/ai-settings?test=error&task=' + encodeURIComponent(task) + '&message=' + encodeURIComponent(errorMessage(e, 'AI 测试失败').slice(0, 600)))
  }
})

// ---- AI 提示词管理 ----
// 提示词和模型参数一样保存在现有 D1 settings 表，不新增 migration。
adminRoutes.get('/ai-prompts', async (c) => {
  const settings = await getAiPromptSettings(c.env)
  return c.html(renderAiPromptsPage(settings, c.req.query('saved') || '', {
    status: c.req.query('test') || '',
    key: c.req.query('testKey') || '',
    provider: c.req.query('provider') || '',
    model: c.req.query('model') || '',
    response: c.req.query('response') || '',
    error: c.req.query('error') || '',
  }))
})

adminRoutes.post('/ai-prompts/save', async (c) => {
  const b = await c.req.parseBody()
  const key = String(b.prompt_key || '')
  const allowed = ['global', 'news', 'city', 'service', 'article', 'keyword', 'landing', 'page'] as const
  if (!allowed.includes(key as typeof allowed[number])) return c.text('无效的提示词类型', 400)

  const value = String(b.prompt || '')
  const check = validateAiPromptVariables(key as any, value)
  if (check.unknown.length) {
    return c.redirect('/admin/ai-prompts?error=' + encodeURIComponent(
      AI_PROMPT_SPECS[key as keyof typeof AI_PROMPT_SPECS].title + '存在未知变量：' + check.unknown.join('、') + '。请使用页面列出的变量。',
    ))
  }
  await saveAiPromptSettings(c.env, { [key]: value } as any)
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/ai-prompts?saved=' + encodeURIComponent(key))
})

adminRoutes.post('/ai-prompts/test', async (c) => {
  const b = await c.req.parseBody()
  const key = String(b.prompt_key || '')
  const allowed = ['global', 'news', 'city', 'service', 'article', 'keyword', 'landing', 'page'] as const
  if (!allowed.includes(key as typeof allowed[number])) return c.text('无效的提示词类型', 400)

  const settings = await getAiSettings(c.env)
  if (!settings.enabled) {
    return c.redirect('/admin/ai-prompts?test=disabled&testKey=' + encodeURIComponent(key))
  }
  try {
    const routeStatus = await getAiRouteStatus(c.env)
    if (!routeStatus.ok) {
      return c.redirect('/admin/ai-prompts?test=error&testKey=' + encodeURIComponent(key) + '&error=' + encodeURIComponent(routeStatus.message))
    }

    const spec = AI_PROMPT_SPECS[key as keyof typeof AI_PROMPT_SPECS]
    const promptSettings = await getAiPromptSettings(c.env)
    const prompt = await composeAiPromptWithSystemContacts(
      c.env,
      promptSettings,
      key === 'global' ? null : key as any,
      spec.sampleVariables,
      routeStatus.settings,
    )
    const testInstruction = '\n\n<TEST_INSTRUCTION>这是提示词管理后台的测试，不要写入数据库。严格按照当前任务要求输出；只返回最终内容，不要解释提示词。</TEST_INSTRUCTION>'
    const result: any = await runConfiguredAi(
      c.env,
      { messages: [{ role: 'user', content: prompt + testInstruction }] },
      { ...settings, maxTokens: Math.max(settings.maxTokens, key === 'keyword' ? 1024 : 3072) },
    )
    const responseText = getAiResponseText(result).trim()
    if (!responseText) throw new Error('Workers AI 返回了空文本')
    const model = routeStatus.settings.provider === 'workers_ai' ? routeStatus.settings.model : routeStatus.settings.externalModel
    return c.redirect(
      '/admin/ai-prompts?test=ok&testKey=' + encodeURIComponent(key) +
      '&provider=' + encodeURIComponent(routeStatus.settings.provider) +
      '&model=' + encodeURIComponent(model) +
      '&response=' + encodeURIComponent(responseText.slice(0, 2400)),
    )
  } catch (e) {
    console.error('AI prompt test failed', e)
    return c.redirect(
      '/admin/ai-prompts?test=error&testKey=' + encodeURIComponent(key) +
      '&error=' + encodeURIComponent(errorMessage(e, '提示词测试失败').slice(0, 600)),
    )
  }
})

adminRoutes.post('/ai-prompts/reset', async (c) => {
  const b = await c.req.parseBody()
  const key = String(b.prompt_key || '')
  const allowed = ['global', 'news', 'city', 'service', 'article', 'keyword', 'landing', 'page'] as const
  if (!allowed.includes(key as typeof allowed[number])) return c.text('无效的提示词类型', 400)

  await saveAiPromptSettings(c.env, { [key]: '' } as any)
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/ai-prompts?saved=' + encodeURIComponent(key + '-reset'))
})

adminRoutes.post('/settings/generate-industry-keywords', async (c) => {
  try {
    const settings = await readSettingsMap(c.env)
    const aiSettings = await getAiSettings(c.env)
    if (!aiSettings.enabled) return c.redirect('/admin/settings?error=' + encodeURIComponent('AI 功能当前已停用，请先在 AI 设置中启用。'))
    const promptSettings = await getAiPromptSettings(c.env)
    const prompt = await composeAiPromptWithSystemContacts(c.env, promptSettings, 'keyword', {
      siteName: settings.site_name || c.env.SITE_NAME || '网站内容平台',
      subject: settings.site_topic || settings.site_industry || '',
      keywords: [settings.primary_keywords || '', settings.industry_keywords || ''].filter(Boolean).join('、'),
      services: settings.primary_services || '',
      task: '根据当前站点名称、主题、行业、核心服务和已有主题词生成行业关键词候选；去除无关词、品牌词和同义重复词。',
    }, aiSettings)
    const result = await runConfiguredAi(c.env, { messages: [{ role: 'user', content: prompt }] }, aiSettings)
    const parsed = parseAiJson(getAiResponseText(result).trim()) as any
    const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.keywords) ? parsed.keywords : []
    const merged = normalizeKeywordCandidates([...String(settings.industry_keywords || '').split(/[,，;；\n、]+/), ...candidates], 30)
    if (!merged.length) throw new Error('AI没有返回可用行业关键词，请先填写站点行业、主题或核心服务。')
    await saveSetting(c.env, 'industry_keywords', merged.join(','))
    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    return c.redirect('/admin/settings?saved=1&ai=industry-keywords')
  } catch (e) {
    console.error('generate industry keywords failed', e)
    return c.redirect('/admin/settings?error=' + encodeURIComponent('AI行业关键词生成失败：' + errorMessage(e, '未知错误').slice(0, 500)))
  }
})
// ---- 系统设置 ----

adminRoutes.post('/settings/contact-qr', async (c) => {
  const fileValue = (await c.req.parseBody()).file
  const file = fileValue instanceof File ? fileValue : null
  if (!file || !file.name) return c.redirect('/admin/settings?error=' + encodeURIComponent('请选择二维码文件'))
  if (file.size > 5 * 1024 * 1024) return c.redirect('/admin/settings?error=' + encodeURIComponent('二维码文件最大 5MB'))
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    return c.redirect('/admin/settings?error=' + encodeURIComponent('二维码仅支持 JPG、PNG、WEBP'))
  }

  const oldQr = await c.env.DB.prepare("SELECT value FROM settings WHERE key='contact_qr_url'").first() as any
  const imageBytes = await file.arrayBuffer()
  if (!imageBytes.byteLength) return c.redirect('/admin/settings?error=' + encodeURIComponent('二维码文件为空，请重新选择图片'))
  const objectKey = 'media/contact/wechat-' + crypto.randomUUID() + '.' + ((file.type.split('/')[1] || 'png').replace(/[^a-z0-9]/g, ''))
  await c.env.R2_MEDIA.put(objectKey, imageBytes, {
    httpMetadata: { contentType: file.type, contentDisposition: 'inline' },
    customMetadata: { purpose: 'wechat-contact-qr', originalName: file.name },
  })
  const publicUrl = '/media/' + objectKey.slice('media/'.length)
  await c.env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('contact_qr_url', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).bind(publicUrl).run()
  // 替换二维码后直接删除旧 R2 对象，避免后台长期积累无引用文件。
  const oldUrl = String(oldQr?.value || '')
  if (oldUrl.startsWith('/media/contact/')) {
    const oldKey = 'media/' + oldUrl.slice('/media/'.length)
    await c.env.R2_MEDIA.delete(oldKey).catch((e) => console.error('old contact QR delete failed', e))
    c.executionCtx.waitUntil(purgeCacheTags(c.executionCtx, [mediaCacheTag(oldKey)]))
  }
  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/settings?saved=1')
})


adminRoutes.post('/settings/contact-qr/delete', async (c) => {
  const row = await c.env.DB.prepare("SELECT value FROM settings WHERE key='contact_qr_url'").first() as any
  const configured = String(row?.value || '').trim()
  if (configured.startsWith('/media/')) {
    const key = 'media/' + configured.slice('/media/'.length)
    await permanentlyDeleteMediaObject(c, key)
  } else {
    await c.env.DB.prepare("DELETE FROM settings WHERE key='contact_qr_url'").run()
  }
  await purgeCacheAll(c.executionCtx)
  c.header('Cache-Control', 'no-store')
  return c.redirect('/admin/settings?saved=1')
})

adminRoutes.get('/page-nav-labels', async (c) => {
  const settings = await readSettingsMap(c.env)
  return c.json(getPageNavigationLabels(settings, 'zh-CN'))
})

adminRoutes.get('/settings', async (c) => {
  const rows = (await c.env.DB.prepare("SELECT key, value FROM settings WHERE key NOT LIKE 'ai_page:%' AND key NOT LIKE 'ai_%' AND key NOT LIKE 'secret:%'").all()).results as any[]
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value
  map.indexnow_key_configured = (await getIndexNowKey(c.env)) ? '1' : '0'
  map.resend_api_key_configured = (await hasProtectedSecret(c.env, 'RESEND_API_KEY') || !!String(c.env.RESEND_API_KEY || '').trim()) ? '1' : '0'
  map.google_service_account_configured = (await hasProtectedSecret(c.env, 'GOOGLE_SERVICE_ACCOUNT_JSON') || !!String(c.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim()) ? '1' : '0'
  return c.html(renderSettingsPage(map, c.req.query('error') || '', c.req.query('saved') === '1', c.req.query('ai') || ''))
})
adminRoutes.post('/settings/ai-seo', async (c) => {
  const body = await c.req.parseBody()
  const target = String(body.target || '').trim()
  const allowedPages = ['home', 'services', 'cities', 'articles', 'about', 'contact']
  if (target !== 'site' && !allowedPages.includes(target)) {
    return c.redirect('/admin/settings?error=' + encodeURIComponent('无效的 AI SEO 页面'))
  }

  try {
    const settings = await readSettingsMap(c.env)
    if (target === 'site') {
      const siteName = String(settings.site_name || c.env.SITE_NAME || '网站内容平台').trim()
      const ai = await generateAiPageContent(c.env, {
        type: 'page',
        pageLabel: siteName + '首页SEO',
        pagePath: '/',
        title: String(settings.site_title || ''),
        summary: String(settings.site_description || ''),
        sourceContent: String(settings.site_description || ''),
      })
      if (!ai) throw new Error('AI没有返回通过质量门槛的站点 SEO 内容')
      const keywords = alignSeoKeywordsToContent(
        [siteName + '服务', settings.site_topic || '', settings.site_industry || '', ...normalizeKeywordCandidates([settings.primary_keywords || '', settings.industry_keywords || '', settings.site_keywords || ''].join(','), 20)],
        ai.title,
        ai.summary,
        ai.content,
        5,
      )
      await saveSetting(c.env, 'site_title', ai.title.slice(0, 120))
      await saveSetting(c.env, 'site_description', ai.summary.slice(0, 180))
      // 固定关键词（全站候选词库）由管理员手工维护；AI SEO 规范不能覆盖词库。
      await saveSetting(c.env, 'site_seo_ai_generated', '1')
      await syncPageSeoKeywords(c.env)
      c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
      return c.redirect('/admin/settings?saved=1&ai=site')
    }

    const pages = getPageSettings(settings)
    const page = pages[target as keyof typeof pages]
    const ai = await generateAiPageContent(c.env, {
      type: 'page',
      pageLabel: page.labelZh,
      pagePath: page.path,
      title: page.titleZh,
      summary: page.subtitleZh,
      sourceContent: page.contentZh,
    })
    if (!ai) throw new Error('AI没有返回通过质量门槛的页面内容')
    const keywords = alignSeoKeywordsToContent(
      [page.labelZh, page.labelZh + '服务', page.labelZh + '办理', page.labelZh + '流程', settings.site_topic || '', settings.site_industry || '', ...normalizeKeywordCandidates([settings.primary_keywords || '', settings.industry_keywords || '', settings.site_keywords || ''].join(','), 20)],
      ai.title,
      ai.summary,
      ai.content,
      5,
    )
    pages[target as keyof typeof pages] = {
      ...page,
      titleZh: ai.title,
      subtitleZh: ai.summary,
      contentZh: ai.content,
      seoKeywordsZh: keywords.join(','),
      aiGenerated: true,
    }
    await saveSetting(c.env, 'page_settings_json', serializePageSettings(pages))
    if (target === 'home') await saveSetting(c.env, 'site_seo_ai_generated', '1')
    await syncPageSeoKeywords(c.env)
    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    return c.redirect('/admin/settings?saved=1&ai=' + encodeURIComponent(target))
  } catch (e) {
    console.error('settings AI SEO generation failed', e)
    return c.redirect('/admin/settings?error=' + encodeURIComponent(errorMessage(e, 'AI SEO生成失败')))
  }
})


adminRoutes.post('/settings', async (c) => {
  const b = await c.req.parseBody()
  const has = (key: string) => Object.prototype.hasOwnProperty.call(b, key)
  const value = (key: string, max = 2000) => String((b as any)[key] ?? '').trim().slice(0, max)
  const updates: Record<string, string> = {}

  const textFields: Record<string, number> = {
    site_name: 80, site_title: 200, site_description: 1000,
    site_topic: 120, site_industry: 80, primary_services: 1000,
    primary_keywords: 1200, industry_keywords: 1600, news_categories: 500,
    email_from: 200, email_reply_to: 200,
    baidu_token: 200, so_token: 200, sogou_token: 200,
    footer_copyright: 200, footer_disclaimer: 500, footer_ai_notice: 500, footer_links: 1500,
  }
  for (const [key, max] of Object.entries(textFields)) {
    if (has(key)) updates[key] = value(key, max)
  }

  // Deprecated: contact_* fields are no longer handled here.
  // Use /admin/modules/contact (Contact Channels) API instead.

    const protectedSecrets: Array<[string, string]> = [
    ['INDEXNOW_KEY', String((b as any).indexnow_key || '').trim()],
    ['RESEND_API_KEY', String((b as any).resend_api_key || '').trim()],
    ['GOOGLE_SERVICE_ACCOUNT_JSON', String((b as any).google_service_account_json || '').trim()],
  ]
  for (const [name, secret] of protectedSecrets) {
    if (secret) await saveProtectedSecret(c.env, name, secret)
  }
  if (String((b as any).clear_indexnow_key || '') === 'on') {
    await saveProtectedSecret(c.env, 'INDEXNOW_KEY', '')
    await c.env.DB.prepare("DELETE FROM settings WHERE key='indexnow_key'").run()
  }

if (Object.keys(updates).length) {
    await c.env.DB.batch(
      Object.entries(updates).map(([key, val]) =>
        c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
          .bind(key, val)
      ),
    )
  }

  c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
  return c.redirect('/admin/settings?saved=1')
})

// 重新计算全部关键词机会分：城市权重 + 服务需求 + 难度 + 搜索量。
async function rescoreAllKeywords(env: Bindings): Promise<number> {
  const result = await env.DB.prepare(
    `UPDATE keywords
     SET opportunity_score = CAST(ROUND(
       (
         (CASE (SELECT tier FROM cities WHERE id=keywords.city_id)
            WHEN '一线' THEN 100 WHEN '新一线' THEN 75 WHEN '二线' THEN 55 WHEN '三线' THEN 35 ELSE 50 END) * 0.5
         + COALESCE((SELECT demand_weight FROM services WHERE id=keywords.service_id),50) * 0.3
         + (100 - CASE keywords.difficulty WHEN '高' THEN 55 WHEN '低' THEN 10 ELSE 30 END) * 0.2
       ) * 0.8
       + CASE
           WHEN COALESCE(keywords.search_volume,0) >= 10000 THEN 20
           WHEN COALESCE(keywords.search_volume,0) >= 1000 THEN 15
           WHEN COALESCE(keywords.search_volume,0) >= 100 THEN 10
           WHEN COALESCE(keywords.search_volume,0) >= 10 THEN 5
           ELSE 0
         END
     ) AS INTEGER)`
  ).run()
  return Number((result as any)?.meta?.changes || 0)
}

adminRoutes.post('/keywords/rescore', async (c) => {
  try {
    const changed = await rescoreAllKeywords(c.env)
    c.executionCtx.waitUntil(purgeCacheAll(c.executionCtx))
    return c.redirect('/admin/keywords?message=' + encodeURIComponent('机会分已重新计算：更新 ' + changed + ' 条关键词；页面 SEO 未被改写。'))
  } catch (e) {
    console.error('keyword rescore failed', e)
    return c.redirect('/admin/keywords?error=' + encodeURIComponent('机会分重算失败：' + errorMessage(e, '未知错误')))
  }
})

// 手动调整单条关键词（人工复核搜索量/难度后回写，供后续重新计分）
