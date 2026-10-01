import type { Bindings } from '../types'
import { generateInfographicSvg } from '../utils/cardSvg'
import { getAiSettings, runConfiguredAi, type AiSettings } from '../utils/aiSettings'
import { composeAiPromptWithSystemContacts, getAiPromptSettings, type AiPromptSettings } from '../utils/aiPrompts'
import { getAiResponseText, parseAiJson } from '../utils/aiJson'
import { buildArticleSeoKeywords, normalizeSeoKeywords } from '../utils/autoSeo'
import { generateAiPageContent } from '../utils/aiPageContent'
import { aiContentSettingKey } from '../utils/aiContentStore'
import { getSiteProfile, loadSiteProfileSettings } from '../utils/siteProfile'
import { errorMessage } from '../utils/errors'
import { MIN_NEWS_QUALITY_SCORE } from '../services/newsPipeline'

type FeedItem = { title: string; link: string; sourceContent?: string; isDirectArticle?: boolean }
type NewsContentType = string
type Rewritten = {
  title: string
  summary: string
  content: string
  interpretation: string
  content_type: NewsContentType
  seo_title: string
  seo_keywords: string
  seo_description: string
  ai_score: number
  slides: { heading: string; text: string }[]
}

const USER_AGENT = 'Mozilla/5.0 (compatible; WhiteLabelCmsBot/1.0)'

function normalizeCharset(label: string): string {
  const value = String(label || '').trim().toLowerCase().replace(/["']/g, '')
  if (!value) return ''
  if (value === 'gb2312' || value === 'gbk' || value === 'x-gbk' || value === 'windows-936' || value === 'cp936') return 'gb18030'
  return value
}

function detectCharset(contentType: string, htmlBytes: Uint8Array): string {
  const headerMatch = String(contentType || '').match(/charset\s*=\s*["']?([a-z0-9._-]+)/i)
  if (headerMatch?.[1]) return normalizeCharset(headerMatch[1])

  // charset 一般只出现在 ASCII 元数据里；先用 UTF-8 读开头即可识别 meta charset。
  const prefix = new TextDecoder().decode(htmlBytes.slice(0, Math.min(htmlBytes.length, 12000)))
  const metaMatch = prefix.match(/<meta\b[^>]*(?:charset\s*=\s*["']?\s*|content\s*=\s*["'][^"']*charset\s*=\s*)([a-z0-9._-]+)/i)
  if (metaMatch?.[1]) return normalizeCharset(metaMatch[1])

  return ''
}

function looksMojibake(text: string): boolean {
  const value = String(text || '')
  const replacementCount = (value.match(/\uFFFD/g) || []).length
  const suspiciousCount = (value.match(/[ÃÂÊ˰˯�]|(?:\?\?\?)+/g) || []).length
  return replacementCount > 0 || suspiciousCount >= 2
}

async function decodeResponseBody(res: Response): Promise<string> {
  const bytes = new Uint8Array(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || ''
  const charset = detectCharset(contentType, bytes)

  if (charset) {
    try {
      return new TextDecoder(charset).decode(bytes)
    } catch (e) {
      console.warn('unsupported response charset, fallback to utf-8', charset, e)
    }
  }

  const utf8 = new TextDecoder().decode(bytes)
  // 部分历史政府/行业网站仍可能使用非 UTF-8 编码。
  // 如果 UTF-8 已出现明显替换字符，再尝试 GB18030，避免中文标题进入数据库后变成乱码。
  if (looksMojibake(utf8)) {
    try {
      const gb18030 = new TextDecoder('gb18030').decode(bytes)
      if (!looksMojibake(gb18030)) return gb18030
    } catch (e) {
      console.warn('GB18030 decode failed', e)
    }
  }
  return utf8
}

function decodeHtml(value: string): string {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n)
      return Number.isFinite(code) ? String.fromCodePoint(Math.min(code, 0x10ffff)) : ''
    })
    .replace(/&#x([\da-f]+);/gi, (_m, n) => {
      const code = parseInt(n, 16)
      return Number.isFinite(code) ? String.fromCodePoint(Math.min(code, 0x10ffff)) : ''
    })
}

function cleanText(value: string, max = 12000): string {
  return decodeHtml(String(value || ''))
    .replace(/<(script|style|noscript|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function extractArticleText(html: string): string {
  const candidates = [
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1],
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1],
    html.match(/<(?:div|section)\b[^>]*(?:id|class)=["'][^"']*(?:TRS_Editor|article[-_ ]?(?:content|body|text)?|news[-_ ]?(?:content|body|text)?|content[-_ ]?(?:main|detail|body)?|articleText|article-content|detail-content|TRS_PreAppend)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i)?.[1],
    html.match(/<(?:div|section)\b[^>]*(?:id|class)=["'][^"']*(?:content|detail|正文|内容)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i)?.[1],
  ]
  const best = candidates
    .map((htmlPart) => cleanText(htmlPart || '', 18000))
    .sort((a, b) => b.length - a.length)[0] || cleanText(html, 18000)

  return best
    .split(/[。！？；\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 6)
    .join('。')
    .slice(0, 12000)
}

type CollectionExecutionContext = { waitUntil: (promise: Promise<unknown>) => void }

type SourceFetchResult = {
  body: string
  contentType: string
  finalUrl: string
}

const BROWSER_HEADERS: Record<string, string>[] = [
  {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.6',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
  },
  {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5',
    'Cache-Control': 'no-cache',
  },
]

async function fetchViaReader(candidate: string, options: { timeoutMs?: number; tryAlternateScheme?: boolean } = {}): Promise<SourceFetchResult | null> {
  const timeoutMs = Math.max(1500, Math.min(options.timeoutMs || 7000, 12000))
  const tryAlternateScheme = options.tryAlternateScheme !== false
  const targets = [candidate]
  if (tryAlternateScheme) {
    try {
      const url = new URL(candidate)
      targets.push(url.protocol === 'https:' ? url.href.replace(/^https:/i, 'http:') : url.href.replace(/^http:/i, 'https:'))
    } catch {}
  }

  for (const target of Array.from(new Set(targets)).slice(0, 2)) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let res: Response
      try {
        res = await fetch('https://r.jina.ai/' + target, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/plain,text/markdown,text/html;q=0.9,*/*;q=0.5',
          },
          redirect: 'follow',
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }
      if (!res.ok) {
        console.warn('reader fallback non-2xx', target, res.status)
        continue
      }
      const body = (await res.text()).slice(0, 120000)
      if (!body.trim()) continue
      return {
        body,
        contentType: res.headers.get('content-type') || 'text/plain',
        finalUrl: target,
      }
    } catch (e) {
      console.warn('reader fallback failed', target, e)
    }
  }
  return null
}

function buildSourceCandidates(sourceUrl: string): string[] {
  // 白标模板不对任何特定站点做域名/路径硬编码；仅使用管理员配置的来源地址。
  try {
    const url = new URL(sourceUrl)
    if (!/^https?:$/i.test(url.protocol)) return []
    return [url.href]
  } catch {
    return []
  }
}
function looksLikeDirectArticleUrl(sourceUrl: string): boolean {
  try {
    const pathname = new URL(sourceUrl).pathname
    return /\.shtml$/i.test(pathname) &&
      !/\/xwdt\/xwdt\.shtml$/i.test(pathname) &&
      !/\/common_list\.shtml$/i.test(pathname)
  } catch {
    return false
  }
}

function extractDirectArticleTitle(body: string): string {
  const htmlTitle = stripMarkup(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
  const h1 = stripMarkup(body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '')
  if (h1.length >= 8 && h1.length <= 180) return h1
  if (htmlTitle.length >= 8 && htmlTitle.length <= 180) return htmlTitle

  const markdownHeading = String(body || '').match(/^#{1,3}\s+([^\n]{8,180})$/m)?.[1]
  if (markdownHeading) return stripMarkup(markdownHeading)

  const firstLine = String(body || '').split(/\r?\n/).map((line) => stripMarkup(line)).find((line) => line.length >= 8 && line.length <= 180)
  return firstLine || ''
}

function parseDirectArticle(body: string, sourceUrl: string): FeedItem[] {
  const content = extractArticleText(body)
  if (content.length < 160 || !looksLikeDirectArticleUrl(sourceUrl)) return []
  const title = extractDirectArticleTitle(body)
  if (!title || /^(首页|网站首页)$/i.test(title.trim())) return []
  return [{ title, link: sourceUrl, sourceContent: content, isDirectArticle: true }]
}

async function fetchNewsSource(sourceUrl: string): Promise<SourceFetchResult> {
  const candidates = buildSourceCandidates(sourceUrl)
  let lastError = '请求失败'
  const diagnostics: string[] = []

  // 新闻来源完全由后台配置，不对任何特定行业或站点做特殊处理。
  for (const candidate of candidates.slice(0, 3)) {
    try {
      const url = new URL(candidate)
      const res = await fetch(candidate, {
        headers: {
          ...BROWSER_HEADERS[0],
          Referer: url.origin + '/',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Site': 'none',
        },
        redirect: 'follow',
      })
      if (!res.ok) {
        lastError = 'HTTP ' + res.status + ' @ ' + candidate
        diagnostics.push(lastError)
        continue
      }
      return {
        body: (await decodeResponseBody(res)).slice(0, 120000),
        contentType: res.headers.get('content-type') || '',
        finalUrl: res.url || candidate,
      }
    } catch (e: any) {
      lastError = String(e?.message || e || '请求失败')
      diagnostics.push('直连失败 @ ' + candidate + ': ' + lastError)
    }
  }

  for (const candidate of candidates.slice(0, 3)) {
    const fallback = await fetchViaReader(candidate)
    if (fallback) return fallback
  }


  throw new Error((diagnostics.slice(-6).join('；') || lastError) + '；直连与 Reader 均未取得来源内容')
}

async function fetchArticleSourceContent(item: FeedItem, options: { allowFallback?: boolean; allowSourceEvidenceFallback?: boolean } = {}): Promise<string> {
  const allowFallback = options.allowFallback !== false
  const allowSourceEvidenceFallback = options.allowSourceEvidenceFallback === true
  const fallback = cleanText(item.sourceContent || '', 10000)
  if (item.isDirectArticle && fallback.length >= 160) return fallback
  const attempts = [
    ...BROWSER_HEADERS,
    {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
  ]
  let lastError = ''
  const detailCandidates = looksLikeDirectArticleUrl(item.link) ? [item.link] : buildSourceCandidates(item.link)
  for (const candidate of detailCandidates.slice(0, 2)) {
    try {
      const url = new URL(candidate)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)
      try {
        const res = await fetch(candidate, {
          headers: {
            ...BROWSER_HEADERS[0],
            Referer: url.origin + '/',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Site': 'none',
          },
          signal: controller.signal,
        })
        if (!res.ok) {
          lastError = 'HTTP ' + res.status
          continue
        }
        const html = (await decodeResponseBody(res)).slice(0, 120000)
        const content = extractArticleText(html)
        if (content.length >= 120) return content
        lastError = '页面已返回，但未识别到有效正文'
      } finally {
        clearTimeout(timer)
      }
    } catch (e: any) {
      lastError = String(e?.message || e || '请求失败')
    }
  }
  // 部分政务或行业站点偶尔会在 Worker 侧返回 5xx、超时或中途断开；
  // 详情页即使不是标准错误码，也统一再尝试一次 Reader 兜底，避免“operation was aborted”直接结束。
  const reader = await fetchViaReader(item.link, { timeoutMs: 7000, tryAlternateScheme: false })
  if (reader) {
    const readerContent = extractArticleText(reader.body)
    if (readerContent.length >= 120) return readerContent
    lastError = 'Reader已返回页面，但未识别到有效正文'
  }
  if (allowSourceEvidenceFallback && fallback.length >= 120) {
    console.warn('fetch article detail failed; using candidate analysis evidence fallback', item.link, lastError)
    return fallback
  }
  if (allowFallback && fallback.length >= 120) {
    console.warn('fetch article detail failed; using feed/list summary fallback', item.link, lastError)
    return fallback
  }
  console.error('fetch article detail failed', item.link, lastError)
  return ''
}
function normalizeUrl(link: string, baseUrl: string): string {
  try {
    const url = new URL(decodeHtml(link.trim()), baseUrl)
    if (!/^https?:$/i.test(url.protocol)) return ''
    url.hash = ''
    return url.href
  } catch {
    return ''
  }
}

function stripMarkup(value: string): string {
  return cleanText(
    String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1'),
    300,
  )
}

function dedupeItems(items: FeedItem[]): FeedItem[] {
  const seen = new Map<string, FeedItem>()
  for (const item of items) {
    const key = item.link || item.title.trim().toLowerCase()
    if (!key) continue
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, { ...item })
      continue
    }
    if ((!existing.sourceContent || existing.sourceContent.length < (item.sourceContent?.length || 0)) && item.sourceContent) {
      existing.sourceContent = item.sourceContent
    }
  }
  return Array.from(seen.values())
}

function isUsefulNewsLink(title: string, link: string, sourceUrl: string): boolean {
  if (!title || title.length < 8 || title.length > 120) return false
  if (!link || link === sourceUrl) return false
  if (/^(javascript:|mailto:|tel:|#)/i.test(link)) return false
  if (/\/login\b|\/search\b|\/index\.(?:html?|php)$/i.test(link) && !/政策|文件|公告|通知|解读|指南|更新/i.test(title)) return false
  if (/上一页|下一页|首页|尾页|登录|注册|关闭|更多|联系我们|网站地图/i.test(title)) return false
  return true
}

function extractFeedSummary(block: string): string {
  const raw =
    block.match(/<(?:description|summary|content(?::encoded)?)\b[^>]*>([\s\S]*?)<\/(?:description|summary|content(?::encoded)?)>/i)?.[1] ||
    block.match(/<dc:description\b[^>]*>([\s\S]*?)<\/dc:description>/i)?.[1] ||
    ''
  return cleanText(raw, 5000)
}

function extractHtmlListContext(html: string, anchorIndex: number, title: string): string {
  const tags = ['li', 'tr', 'article']
  for (const tag of tags) {
    const open = html.lastIndexOf('<' + tag, anchorIndex)
    const close = html.indexOf('</' + tag + '>', anchorIndex)
    if (open >= 0 && close > anchorIndex && close - open <= 8000) {
      const context = cleanText(html.slice(open, close + tag.length + 3), 5000)
      if (context && context !== title && context.length >= 30) return context.slice(0, 4000)
    }
  }
  const windowStart = Math.max(0, anchorIndex - 600)
  const windowEnd = Math.min(html.length, anchorIndex + 1800)
  const context = cleanText(html.slice(windowStart, windowEnd), 3000)
  return context === title ? '' : context.slice(0, 2500)
}

function parseRssLike(xml: string, sourceUrl: string): FeedItem[] {
  const items: FeedItem[] = []
  const rssMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || []
  for (const block of rssMatches) {
    const title = stripMarkup(block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    const link = normalizeUrl(
      block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1] ||
      block.match(/<guid\b[^>]*>([\s\S]*?)<\/guid>/i)?.[1] || '',
      sourceUrl,
    )
    const sourceContent = extractFeedSummary(block)
    if (title && link) items.push({ title, link, sourceContent })
  }

  const atomMatches = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || []
  for (const block of atomMatches) {
    const title = stripMarkup(block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    const href =
      block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] ||
      block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1] || ''
    const link = normalizeUrl(href, sourceUrl)
    const sourceContent = extractFeedSummary(block)
    if (title && link) items.push({ title, link, sourceContent })
  }
  return dedupeItems(items).slice(0, 5)
}

function parseHtmlList(html: string, sourceUrl: string): FeedItem[] {
  const items: FeedItem[] = []
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = anchorRegex.exec(html)) && items.length < 100) {
    const title = stripMarkup(match[2])
    const link = normalizeUrl(match[1], sourceUrl)
    if (isUsefulNewsLink(title, link, sourceUrl)) {
      items.push({
        title,
        link,
        sourceContent: extractHtmlListContext(html, match.index ?? 0, title),
      })
    }
  }
  return dedupeItems(items).slice(0, 5)
}

function parseJsonFeed(text: string, sourceUrl: string): FeedItem[] {
  try {
    const parsed = JSON.parse(text)
    const rows = Array.isArray(parsed?.items) ? parsed.items : []
    return dedupeItems(rows.map((item: any) => ({
      title: stripMarkup(item?.title || item?.name || ''),
      link: normalizeUrl(String(item?.url || item?.link || ''), sourceUrl),
      sourceContent: cleanText(String(item?.content || item?.description || item?.summary || ''), 5000),
    })).filter((item: FeedItem) => isUsefulNewsLink(item.title, item.link, sourceUrl))).slice(0, 5)
  } catch {
    return []
  }
}
function parseMarkdownLinks(text: string, sourceUrl: string): FeedItem[] {
  const items: FeedItem[] = []
  const regex = /\[([^\]\n]{8,120})\]\((https?:\/\/[^)\s]+)\)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) && items.length < 20) {
    const title = stripMarkup(match[1])
    const link = normalizeUrl(match[2], sourceUrl)
    if (isUsefulNewsLink(title, link, sourceUrl)) items.push({ title, link, sourceContent: '' })
  }
  return dedupeItems(items).slice(0, 5)
}

type AiSourceAnalysis = {
  method: 'ai-source-page'
  summary: string
  items: { title: string; link: string; evidence: string; confidence: number }[]
}

async function analyzeSourcePageWithAi(
  env: Bindings,
  sourceUrl: string,
  sourceName: string,
  body: string,
  contentType: string,
  aiSettings: AiSettings,
): Promise<AiSourceAnalysis | null> {
  const snapshot = String(body || '').slice(0, 24000)
  if (!snapshot.trim()) return null

  const siteProfile = getSiteProfile(await loadSiteProfileSettings(env), env.SITE_NAME || '')
  const siteContext = [
    '当前站点主题：' + (siteProfile.topic || '未设置'),
    '当前站点行业：' + (siteProfile.industry || '未设置'),
    '核心服务：' + (siteProfile.primaryServices.join('、') || '未设置'),
    '行业关键词：' + (siteProfile.industryKeywords.join('、') || '未设置'),
  ].join('\n')

  const prompt = [
    '你是新闻采集系统的“来源页面结构分析器”。',
    '你不能自行联网打开网址，只能分析下方已经由 Worker 抓取到的页面快照。',
    '目标：从来源地址/新闻列表页快照中识别真实新闻候选；优先使用页面里已经出现的标题和链接，不得猜造不存在的 URL。',
    '来源名称：' + sourceName,
    '来源地址：' + sourceUrl,
    '页面 Content-Type：' + contentType,
    '站点识别上下文（只用于判断候选与当前站点主题的相关性，不得凭此制造新闻事实）：',
    siteContext,
    '',
    '返回一个合法 JSON 对象，不要 Markdown：',
    '{"summary":"","items":[{"title":"","link":"","evidence":"","confidence":0}]}',
    '规则：',
    '1. 最多提取 5 条；title 必须来自页面文本，link 必须来自页面中出现的 href/URL/Markdown 链接，可把相对链接按来源地址补全。',
    '2. evidence 只能摘取/压缩页面快照中已经出现的事实，不得补造日期、数字、政策结论、文件编号。',
    '3. 排除首页、更多、登录、导航、分页、站点栏目等非文章链接。',
    '4. confidence 为 0-1；无法确认是真实文章入口就不要返回。',
    '5. summary 说明当前页面是否像新闻列表、主要结构和识别到的候选数量。',
    '',
    '页面抓取快照开始：',
    snapshot,
    '页面抓取快照结束。',
  ].join('\n')

  try {
    const res = await runConfiguredAi(
      env,
      { messages: [{ role: 'user', content: prompt }] },
      { ...aiSettings, maxTokens: Math.max(1200, Math.min(aiSettings.maxTokens || 1536, 2048)) },
    )
    const parsed = parseAiJson(getAiResponseText(res))
    if (!parsed || typeof parsed !== 'object') return null

    const items = Array.isArray((parsed as any).items)
      ? (parsed as any).items.map((row: any) => {
          const title = stripMarkup(String(row?.title || '')).slice(0, 180)
          const link = normalizeUrl(String(row?.link || ''), sourceUrl)
          const evidence = cleanText(String(row?.evidence || ''), 3500)
          const confidenceRaw = Number(row?.confidence)
          const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0
          if (!title || !link || !isUsefulNewsLink(title, link, sourceUrl) || confidence < 0.6) return null
          return { title, link, evidence, confidence }
        }).filter(Boolean)
      : []

    return {
      method: 'ai-source-page',
      summary: cleanText(String((parsed as any).summary || ''), 800),
      items: items.slice(0, 5) as AiSourceAnalysis['items'],
    }
  } catch (e) {
    console.error('AI source-page analysis failed', { sourceUrl, error: errorMessage(e, 'AI解析失败').slice(0, 800) })
    return null
  }
}

export async function analyzeNewsSource(
  env: Bindings,
  sourceUrl: string,
  sourceName: string,
  aiSettings?: AiSettings,
): Promise<{ fetched: SourceFetchResult; analysis: AiSourceAnalysis | null }> {
  const settings = aiSettings || await getAiSettings(env)
  const fetched = await fetchNewsSource(sourceUrl)
  const analysis = await analyzeSourcePageWithAi(env, sourceUrl, sourceName, fetched.body, fetched.contentType, settings)
  return { fetched, analysis }
}

type WaitUntilContext = {
  waitUntil(promise: Promise<unknown>): void
}

export async function publishAnalyzedNewsCandidate(
  env: Bindings,
  sourceId: number,
  candidate: { title: string; link: string; evidence?: string; confidence?: number },
  siteUrlOverride?: string,
  executionContext?: WaitUntilContext,
): Promise<{ status: 'pending_review' | 'published' | 'duplicate'; articleId?: number; title: string }> {
  const source = await env.DB.prepare('SELECT id, name, feed_url, credibility FROM news_sources WHERE id=? LIMIT 1')
    .bind(sourceId)
    .first() as any
  if (!source) throw new Error('采集来源不存在')

  const aiSettings = await getAiSettings(env)
  if (!aiSettings.enabled) throw new Error('AI 功能当前已停用')

  const sourceUrl = String(source.feed_url || '')
  const title = stripMarkup(String(candidate?.title || '')).trim().slice(0, 180)
  const link = normalizeUrl(String(candidate?.link || ''), sourceUrl)
  const confidence = Number(candidate?.confidence || 0)
  if (!title || !link) throw new Error('候选标题或链接无效')
  if (!isUsefulNewsLink(title, link, sourceUrl)) throw new Error('候选链接未通过来源地址校验')
  if (confidence > 0 && confidence < 0.6) throw new Error('候选置信度低于发布门槛')

  const exists = await env.DB.prepare('SELECT id, title FROM articles WHERE source_url=? LIMIT 1')
    .bind(link)
    .first() as any
  if (exists) {
    return { status: 'duplicate', articleId: Number(exists.id), title: String(exists.title || title) }
  }

  await logCollection(env, source.name, 1, 0, 0, '已选中列表页 AI 候选：' + title + '；开始抓取详情页并进行 AI 解读')

  const item: FeedItem = {
    title,
    link,
    sourceContent: cleanText(String(candidate?.evidence || ''), 3500),
  }
  let detailMode = '详情页正文'
  const detailContent = await fetchArticleSourceContent(item, {
    allowFallback: false,
    allowSourceEvidenceFallback: true,
  })
  if (plainLength(detailContent) < 100) {
    await logCollection(env, source.name, 1, 0, 0, '候选发布失败：详情页与列表页 AI 证据均不足，未进入 AI 解读：' + link)
    throw new Error('详情页没有取得足够正文，且列表页 AI 证据不足以安全生成解读')
  }
  if (detailContent === item.sourceContent) detailMode = '列表页AI证据兜底'
  item.sourceContent = detailContent
  await logCollection(
    env,
    source.name,
    1,
    0,
    0,
    '候选资料已取得：' + detailMode + '；进入 AI 解读：' + title,
  )

  const aiPromptSettings = await getAiPromptSettings(env)
  const rewritten = await aiRewrite(env, item, source.name, aiSettings, aiPromptSettings)
  if (!rewritten) {
    await logCollection(env, source.name, 1, 0, 0, '候选发布失败：AI解读未生成可用内容：' + title)
    throw new Error('AI解读失败或未生成可用内容')
  }
  if (!validNewsRewrite(rewritten, item) || rewritten.ai_score < MIN_NEWS_QUALITY_SCORE) {
    await logCollection(env, source.name, 1, 0, 0, '候选发布失败：AI内容未通过质量门槛，AI质量分=' + rewritten.ai_score + '：' + title)
    throw new Error('AI内容未通过质量门槛')
  }

  const credibilityScore = source.credibility === '高' ? 90 : source.credibility === '低' ? 40 : 70
  const slug = 'news-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  const cardSvg = rewritten.slides.length ? generateInfographicSvg(rewritten.title, rewritten.slides) : null
  const interpretationContent = buildNewsInterpretationContent(rewritten, item, source.name)
  const inserted = await env.DB.prepare(
    'INSERT INTO articles ' +
    '(title, slug, category, summary, content, source_url, source_name, ai_generated, credibility_score, ' +
    'status, published_at, seo_title, seo_keywords, seo_description, ai_score, card_svg, slides_json, service_id) ' +
    "VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'pending_review', NULL, ?, ?, ?, ?, ?, ?, NULL) " +
    'RETURNING id'
  ).bind(
    rewritten.title, slug, rewritten.content_type, rewritten.summary, interpretationContent,
    link, source.name, credibilityScore,
    rewritten.seo_title, rewritten.seo_keywords, rewritten.seo_description, rewritten.ai_score,
    cardSvg, JSON.stringify(rewritten.slides),
  ).first() as any

  try {
    await syncNewsPageAssociations(env, Number(inserted.id), item, source.name, detailContent, aiSettings)
  } catch (e) {
    console.error('sync analyzed candidate city/service/landing pages failed', e)
  }

  const articleId = Number(inserted.id)
  await env.DB.prepare(
    'INSERT INTO review_logs (article_id, action, operator, note) VALUES (?, ?, ?, ?)'
  ).bind(
    inserted.id,
    'pending_review',
    'AI',
    'AI独立解读完成并通过内容质量门槛，已进入人工审核；AI不会直接公开。内容类型=' + rewritten.content_type +
      ' / 可信度分=' + credibilityScore + ' / AI质量分=' + rewritten.ai_score,
  ).run()

  await logCollection(
    env,
    source.name,
    1,
    1,
    0,
    '列表页候选 AI 解读已生成待审核稿：' + rewritten.title + '；资料模式=' + detailMode + '；内容类型=' + rewritten.content_type + '；AI质量分=' + rewritten.ai_score,
  )
  return { status: 'pending_review', articleId, title: rewritten.title }
}

function parseNewsItems(body: string, sourceUrl: string, contentType = ''): FeedItem[] {
  const trimmed = body.trim()
  if (!trimmed) return []

  const jsonItems = /json|javascript/i.test(contentType) || /^\s*[[{]/.test(trimmed)
    ? parseJsonFeed(trimmed, sourceUrl)
    : []
  if (jsonItems.length) return jsonItems

  const rssItems = parseRssLike(trimmed, sourceUrl)
  if (rssItems.length) return rssItems

  const markdownItems = parseMarkdownLinks(trimmed, sourceUrl)
  if (markdownItems.length) return markdownItems

  // 后台如果直接填写单篇 .shtml 详情页，优先按“单篇文章”处理，避免 Reader 输出里的导航链接被误识别成新闻列表。
  const directItems = parseDirectArticle(trimmed, sourceUrl)
  if (directItems.length) return directItems

  // 许多政务网站没有 RSS，而是直接提供“最新文件/政策解读”HTML列表。
  // 新闻采集源后台本身允许填写“RSS 或列表页地址”，因此这里必须支持 HTML。
  return parseHtmlList(trimmed, sourceUrl)
}

function escapeHtml(value: string): string {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch] || ch))
}

function plainLength(value: string): number {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, '').length
}

function hasExcessiveSourceOverlap(source: string, content: string): boolean {
  const sourceText = cleanText(source, 12000)
  const contentText = cleanText(content, 12000)
  if (sourceText.length < 300 || contentText.length < 300) return false
  const sourceSentences = sourceText.split(/[。！？；]/).map((v) => v.trim()).filter((v) => v.length >= 18)
  let matches = 0
  for (const sentence of sourceSentences.slice(0, 80)) {
    if (contentText.includes(sentence.slice(0, Math.min(sentence.length, 32)))) matches++
    if (matches >= 3) return true
  }
  return false
}

function validNewsRewrite(value: Rewritten, item: FeedItem): boolean {
  const title = value.title.trim()
  const summaryLen = plainLength(value.summary)
  const contentLen = plainLength(value.content)
  const interpretationLen = plainLength(value.interpretation)
  const keywords = normalizeSeoKeywords(value.seo_keywords, 5)
  if (title.length < 10 || summaryLen < 45 || contentLen < 550 || interpretationLen < 140) return false
  if (!value.seo_title || value.seo_title.length > 40 || !value.seo_description) return false
  if (title === item.title.trim()) return false
  if (keywords.length < 3 || keywords.length > 5) return false
  if (!/<h2|<h3/i.test(value.content)) return false
  const fullText = cleanText(value.content + ' ' + value.interpretation, 12000)
  if (!/企业影响|实际影响/.test(fullText)) return false
  if (!/流程|步骤|办理|执行|核对|检查/.test(fullText)) return false
  if (!/注意事项|风险|提醒/.test(fullText)) return false
  if (hasExcessiveSourceOverlap(item.sourceContent || '', value.content)) return false
  return value.ai_score >= MIN_NEWS_QUALITY_SCORE
}

function buildNewsInterpretationContent(rewritten: Rewritten, item: FeedItem, sourceName: string): string {
  const content = rewritten.content.trim()
  const interpretation = rewritten.interpretation.trim()
  const sourceLink = escapeHtml(item.link)
  return [
    '<p><strong>本文性质：基于公开原文资料形成的独立解读，不是原文转载。</strong></p>',
    content,
    interpretation ? '<h2>企业影响与建议</h2>' + interpretation : '',
    '<p><strong>原文章链接：</strong><a href="' + sourceLink + '" target="_blank" rel="nofollow noopener">' + sourceLink + '</a></p>',
    '<p>信息来源：' + escapeHtml(sourceName) + '</p>',
  ].filter(Boolean).join('')
}

// ---- AI 撰写原创解读 + 自评质量分 + 生成 SEO 字段 + 生成“图解卡片”文案 ----
async function aiRewrite(env: Bindings, item: FeedItem, sourceName: string, aiSettings: AiSettings, aiPromptSettings: AiPromptSettings): Promise<Rewritten | null> {
  const siteSettings = await loadSiteProfileSettings(env)
  const siteProfile = getSiteProfile(siteSettings, env.SITE_NAME || '')
  const basePrompt = await composeAiPromptWithSystemContacts(env, aiPromptSettings, 'news', {
    siteName: siteProfile.siteName || env.SITE_NAME || '网站内容平台',
    title: item.title,
    sourceName,
    sourceContent: String(item.sourceContent || '').slice(0, 10000),
  }, aiSettings)

  let lastAiError = ''
  async function call(prompt: string, settings: AiSettings): Promise<Rewritten | null> {
    let res: any
    try {
      res = await runConfiguredAi(env, { messages: [{ role: 'user', content: prompt }] }, settings)
    } catch (e: any) {
      lastAiError = errorMessage(e, 'AI调用失败')
      console.error('news AI provider call failed', { title: item.title, error: lastAiError.slice(0, 800) })
      return null
    }
    if (!res) {
      lastAiError = 'AI未返回响应'
      return null
    }
    const raw = getAiResponseText(res)
    const parsed = parseAiJson(raw)
    if (!parsed || typeof parsed !== 'object') {
      lastAiError = 'AI返回不是合法JSON或输出被截断'
      console.error('news AI returned non-JSON or truncated JSON', { title: item.title, raw: raw.slice(0, 1200) })
      return null
    }
    const title = String(parsed.title || '').trim()
    const content = String(parsed.content || '').trim()
    if (!title || !content) return null
    const summary = String(parsed.summary || '').trim()
    const interpretation = String(parsed.interpretation || '').trim()
    const rawType = String(parsed.content_type || '').trim()
    const content_type: NewsContentType = rawType || siteProfile.newsCategories[0] || '行业资讯'
    let siteKeywords = ''
    try {
      const row = await env.DB.prepare("SELECT value FROM settings WHERE key='site_keywords'").first() as any
      siteKeywords = String(row?.value || '')
    } catch {}
    const alignedKeywords = buildArticleSeoKeywords(title, summary, content + ' ' + interpretation, siteKeywords, siteProfile)
    const normalized: Rewritten = {
      title,
      summary,
      content,
      interpretation,
      content_type,
      seo_title: String(parsed.seo_title || title).trim(),
      seo_keywords: alignedKeywords.join(','),
      seo_description: String(parsed.seo_description || summary || '').trim(),
      ai_score: typeof parsed.ai_score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.ai_score))) : 60,
      slides: Array.isArray(parsed.slides)
        ? parsed.slides.slice(0, 4).map((slide: any) => ({
          heading: String(slide?.heading || '').trim().slice(0, 60),
          text: String(slide?.text || '').trim().slice(0, 300),
        })).filter((slide: any) => slide.heading && slide.text)
        : [],
    }
    return normalized
  }

  try {
    // 先按后台“AI 提示词管理”的完整提示词生成。
    const first = await call(basePrompt, aiSettings)
    if (first && validNewsRewrite(first, item)) return first
    if (first) console.warn('news AI first output below quality threshold; retrying', { title: item.title, ai_score: first.ai_score })

    // 新闻批量任务经常因为 JSON 太长在 2048 tokens 截断；失败时自动做一次紧凑重试。
    const retryPrompt = basePrompt + `
<RETRY_MODE>
上一轮输出格式无效。严格只输出完整、合法的 JSON 对象，不要 Markdown、代码围栏或解释文字。
为降低输出长度，保留当前任务的核心事实和统一 SEO/AI 质检标准，但把正文压缩为约500-800字；字段仍需包含 title、summary、content、interpretation、seo_title、seo_keywords、seo_description、ai_score、slides。
seo_keywords 仍严格只保留3-5个主题词，并确保每个词有标题/摘要/正文证据。
</RETRY_MODE>`
    const retry = await call(retryPrompt, { ...aiSettings, maxTokens: Math.max(aiSettings.maxTokens, 3072) })
    if (retry && validNewsRewrite(retry, item)) return retry
    if (retry) console.warn('news AI retry output below quality threshold; using plain-text fallback', { title: item.title, ai_score: retry.ai_score })

    const plainPrompt = basePrompt + `
<FALLBACK_MODE>
进入纯正文兜底模式：不要输出JSON、Markdown、代码围栏或解释文字，只输出可发布正文。
正文约500-800字，必须独立解释事件/政策、企业影响、企业执行步骤、风险/注意事项和行动建议。
保留原文事实边界，不得补造数字、税率、日期、文件编号、处罚结果或案例；关键词只自然表达，不重复堆砌。
</FALLBACK_MODE>`
    let plainRes: any = null
    try {
      plainRes = await runConfiguredAi(
        env,
        { messages: [{ role: 'user', content: plainPrompt }] },
        { ...aiSettings, maxTokens: Math.max(aiSettings.maxTokens, 3072) },
      )
    } catch (e: any) {
      lastAiError = errorMessage(e, 'AI纯正文兜底调用失败')
      console.error('news AI plain fallback call failed', { title: item.title, error: lastAiError.slice(0, 800) })
      return null
    }
    const plainRaw = getAiResponseText(plainRes)
    const plainText = cleanText(plainRaw || '', 7000)
    if (plainText.length >= 420 && !/^[{[]/.test(plainText)) {
      const paragraphs = plainText.split(/[。！？]+/).map((part) => part.trim()).filter((part) => part.length >= 8)
      const html = paragraphs.map((part) => '<p>' + escapeHtml(part) + '。</p>').join('')
      const summary = plainText.slice(0, 100).replace(/[。！？；]$/, '') + '。'
      const topic = siteProfile.topic || siteProfile.industry || '网站主营主题'
      const interpretation = '<p>企业或用户应先核对原文明确的适用范围、时间节点和执行要求，再结合自身业务流程检查是否需要调整；原文未明确的事项不要自行推断。涉及具体业务处理时，建议保留依据并在执行前再次核验最新可靠信息。</p>'
      const fallbackContent =
        '<h2>事件/政策要点</h2>' + html.slice(0, 4200) +
        '<h2>实际影响</h2><p>结合原文适用对象、时间节点和执行要求，判断对目标用户业务流程、成本、资料准备或决策安排的实际影响。</p>' +
        '<h2>执行流程与建议</h2><p>先核对原文适用范围，再整理与当前主题相关的业务资料和内部流程，逐项检查需要调整的环节；不确定事项先确认依据再执行。</p>' +
        '<h2>风险与注意事项</h2><p>不要把资料未明确的数字、日期、规则、案例或结果自行扩大解释；发布或执行前再次核验最新可靠来源。</p>'
      const fallback: Rewritten = {
        title: item.title + '：行业影响与实务解读',
        summary,
        content_type: siteProfile.newsCategories[0] || '行业资讯',
        content: fallbackContent,
        interpretation,
        seo_title: (item.title + ' - ' + (siteProfile.siteName || env.SITE_NAME || '网站内容平台')).slice(0, 40),
        seo_keywords: buildArticleSeoKeywords(
          item.title + '：行业影响与实务解读',
          summary,
          plainText,
          String((await env.DB.prepare("SELECT value FROM settings WHERE key='site_keywords'").first() as any)?.value || ''),
          siteProfile,
        ).join(','),
        seo_description: summary.slice(0, 150),
        ai_score: 67,
        slides: [],
      }
      if (validNewsRewrite(fallback, item)) return fallback
      lastAiError = 'AI纯正文兜底结果未通过新闻质量校验'
      return null
    }
    lastAiError = plainText ? 'AI纯正文兜底内容过短' : 'AI纯正文兜底没有返回文本'
    return null
  } catch (e: any) {
    lastAiError = errorMessage(e, lastAiError || 'AI改写失败')
    console.error('AI rewrite failed', { title: item.title, error: lastAiError.slice(0, 800) })
    return null
  }
}
async function syncNewsPageAssociations(
  env: Bindings,
  articleId: number,
  item: FeedItem,
  sourceName: string,
  sourceContent: string,
  aiSettings: AiSettings,
  generateRelatedAi = true,
): Promise<void> {
  const siteProfile = getSiteProfile(await loadSiteProfileSettings(env), env.SITE_NAME || '')
  const text = [item.title, sourceContent, sourceName].join(' ')
  const cityRows = (await env.DB.prepare('SELECT id, name, slug FROM cities WHERE is_active = 1 ORDER BY LENGTH(name) DESC LIMIT 200').all()).results as any[]
  const serviceRows = (await env.DB.prepare('SELECT id, name, slug FROM services WHERE is_active = 1 ORDER BY LENGTH(name) DESC LIMIT 100').all()).results as any[]
  const city = cityRows.find((row) => String(row.name || '').trim() && text.includes(String(row.name).trim())) as any
  const service = serviceRows.find((row) => {
    const name = String(row.name || '').trim()
    if (!name) return false
    if (item.title.includes(name) || text.includes(name)) return true
    return siteProfile.primaryServices.some((serviceName) => name === serviceName && text.includes(serviceName))
  }) as any

  if (city || service) {
    await env.DB.prepare(
      'UPDATE articles SET city_id=COALESCE(?, city_id), service_id=COALESCE(?, service_id), updated_at=datetime(\'now\') WHERE id=?'
    ).bind(city?.id || null, service?.id || null, articleId).run()
  }
  if (!city || !service) return

  const landingSlug = city.slug + '-' + service.slug
  const landingKeyword = city.name + service.name
  await env.DB.prepare(
    `INSERT INTO keywords (keyword, city_id, service_id, opportunity_score, status, landing_slug)
     VALUES (?, ?, ?, 80, 'published', ?)
     ON CONFLICT(city_id, service_id) DO UPDATE SET
       keyword=excluded.keyword,
       opportunity_score=CASE WHEN COALESCE(keywords.opportunity_score,0) < 80 THEN 80 ELSE keywords.opportunity_score END,
       landing_slug=COALESCE(keywords.landing_slug, excluded.landing_slug)`
  ).bind(landingKeyword, city.id, service.id, landingSlug).run()

  // 新闻 Cron 默认只关联已有城市/服务/关键词；不在同一次 Cron 中再生成 3 份 AI 页面正文，降低 Free 计划 CPU/AI 调用压力。
  if (!generateRelatedAi) return

  const saveAi = async (group: 'cities' | 'services' | 'landing', key: string, input: Parameters<typeof generateAiPageContent>[1], alwaysRefresh = false) => {
    const contentKey = aiContentSettingKey(group, key)
    const exists = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(contentKey).first() as any
    let hasContent = false
    if (exists?.value) {
      try { hasContent = !!JSON.parse(String(exists.value)).content } catch {}
    }
    if (hasContent && !alwaysRefresh) return
    const ai = await generateAiPageContent(env, input, aiSettings)
    if (ai) {
      await env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        .bind(contentKey, JSON.stringify({ ...ai, updatedAt: new Date().toISOString() })).run()
    }
  }

  const context = [
    '这是网站新闻采集生成的独立内容，资料来源：' + sourceName,
    '新闻标题：' + item.title,
    '新闻资料：' + sourceContent.slice(0, 6000),
    '请基于资料中的可核实信息，不编造政策数字、文件编号或联系方式。',
    '所有页面正文都必须把“' + city.name + '”与“' + service.name + '”作为真实业务场景自然结合。',
  ].join('\n')

  await Promise.all([
    saveAi('cities', city.slug, {
      type: 'city', city: city.name,
      keywords: [city.name + siteProfile.topic, city.name + '服务', ...siteProfile.primaryKeywords.slice(0, 2), ...siteProfile.industryKeywords.slice(0, 2)],
      sourceContent: context,
    }),
    saveAi('services', service.slug, {
      type: 'service', service: service.name,
      keywords: [service.name, city.name + service.name, ...siteProfile.industryKeywords.slice(0, 2)],
      sourceContent: context,
    }),
    saveAi('landing', landingSlug, {
      type: 'landing', city: city.name, service: service.name,
      keyword: landingKeyword, keywords: [landingKeyword, city.name + siteProfile.topic, service.name, ...siteProfile.industryKeywords.slice(0, 2)],
      sourceContent: context,
    }, true),
  ])
}

async function readNewsSiteProfile(env: Bindings): Promise<Record<string, string>> {
  return loadSiteProfileSettings(env)
}

async function logCollection(env: Bindings, sourceName: string, fetched: number, created: number, published: number, error?: string) {
  await env.DB.prepare(
    `INSERT INTO collection_logs (source_name, fetched_count, created_count, published_count, error) VALUES (?, ?, ?, ?, ?)`
  ).bind(sourceName, fetched, created, published, error || null).run()
}

export async function runNewsCollection(env: Bindings, sourceId?: number, executionContext?: CollectionExecutionContext, siteUrlOverride = '') {
  const aiSettings = await getAiSettings(env)
  if (!aiSettings.enabled) {
    console.log('Workers AI 已在后台设置中停用，本轮新闻采集不执行 AI 整理')
    return
  }

  const sources = (await (sourceId
    ? env.DB.prepare('SELECT * FROM news_sources WHERE id = ? LIMIT 1').bind(sourceId).all()
    : env.DB.prepare(`SELECT * FROM news_sources WHERE is_active = 1
       ORDER BY CASE WHEN last_fetched_at IS NULL THEN 0 ELSE 1 END, last_fetched_at ASC, id ASC
       LIMIT 1`).all())).results as any[]
  const aiPromptSettings = await getAiPromptSettings(env)

  for (const source of sources) {
    // 先写“运行中”日志：即使后续在远程抓取/AI/CPU阶段中断，也至少能看到任务已经启动。
    await logCollection(env, source.name, 0, 0, 0, '采集任务已启动：正在抓取来源页面')
    let body = ''
    let contentType = ''
    let created = 0
    let published = 0
    let duplicate = 0
    let repaired = 0
    let aiFailed = 0
    let lowScore = 0
    let emptySourceContent = 0
    let summaryFallback = 0
    const failedDetails: string[] = []

    try {
      const fetchedSource = await fetchNewsSource(String(source.feed_url))
      body = fetchedSource.body
      contentType = fetchedSource.contentType
    } catch (e) {
      console.error('fetch feed failed', source.feed_url, e)
      await logCollection(env, source.name, 0, 0, 0, '来源抓取失败：' + String(e))
      continue
    }

    let items = parseNewsItems(body, String(source.feed_url), contentType)
    let sourceAnalysisUsed = false
    let sourceAnalysisSummary = ''
    // 列表页结构不稳定时，先让 AI 分析“已经抓到的页面快照”，识别真实标题/链接/列表证据。
    // AI 不能替代抓取，也不能凭空联网；它只负责解析 Worker 已取得的来源页面。
    const siteProfileForSource = getSiteProfile(await readNewsSiteProfile(env), env.SITE_NAME || '')
    if (!items.length || items.every((item) => plainLength(item.sourceContent || '') < 100)) {
      const sourceAnalysis = await analyzeSourcePageWithAi(
        env,
        String(source.feed_url),
        String(source.name || ''),
        body,
        contentType,
        aiSettings,
      )
      if (sourceAnalysis) {
        sourceAnalysisUsed = true
        sourceAnalysisSummary = sourceAnalysis.summary
        const aiItems: FeedItem[] = sourceAnalysis.items.map((item) => ({
          title: item.title,
          link: item.link,
          sourceContent: item.evidence,
        }))
        items = dedupeItems([...items, ...aiItems]).slice(0, 5)
        try {
          await env.DB.prepare(
            "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
          ).bind(
            'news_source_analysis:' + String(source.id),
            JSON.stringify({
              sourceUrl: String(source.feed_url),
              method: sourceAnalysis.method,
              summary: sourceAnalysis.summary,
              items: sourceAnalysis.items,
              updatedAt: new Date().toISOString(),
            }),
          ).run()
        } catch (e) {
          console.warn('save source analysis failed', source.id, e)
        }
      }
    }


    if (!items.length) {
      await env.DB.prepare("UPDATE news_sources SET last_fetched_at = datetime('now') WHERE id = ?").bind(source.id).run()
      await logCollection(
        env,
        source.name,
        0,
        0,
        0,
        '来源页面已抓取，但普通解析和 AI 列表页分析都没有识别到可核验的新闻链接；请检查是否为可直接访问的新闻列表页。' +
          (sourceAnalysisSummary ? ' AI页面分析：' + sourceAnalysisSummary : ''),
      )
      continue
    }

    // 每次只处理当前来源返回的最新 1 条，降低 Cron/Workers AI CPU，并避免批量生成相似新闻。
    // RSS/Atom/JSON 与大多数列表页按最新优先返回；系统不伪造来源未提供的发布时间。
    items = items.slice(0, 1)
    const enriched = await Promise.all(items.map(async (item) => ({
      ...item,
      sourceContent: await fetchArticleSourceContent(item),
    })))

    for (const item of enriched) {
      const exists = await env.DB.prepare('SELECT id, title, status FROM articles WHERE source_url = ?').bind(item.link).first() as any
      if (exists) {
        // 之前如果错误按 UTF-8 读取 GBK 页面，可能已经把草稿标题保存成乱码。
        // 下一轮同源采集时，只对草稿做一次自动修复，不碰已经发布的文章。
        if (exists.status === 'draft' && looksMojibake(String(exists.title || '')) && item.sourceContent) {
          const repairedDraft = await aiRewrite(env, item, source.name, aiSettings, aiPromptSettings)
          if (repairedDraft && repairedDraft.ai_score >= 50) {
            const credibilityScore = source.credibility === '高' ? 90 : source.credibility === '低' ? 40 : 70
            const cardSvg = repairedDraft.slides.length ? generateInfographicSvg(repairedDraft.title, repairedDraft.slides) : null
            const interpretationContent = buildNewsInterpretationContent(repairedDraft, item, source.name)
            await env.DB.prepare(
              `UPDATE articles
               SET title=?, summary=?, content=?, source_name=?, ai_generated=1, credibility_score=?,
                   status='draft', published_at=NULL, seo_title=?, seo_keywords=?, seo_description=?,
                   ai_score=?, card_svg=?, slides_json=?, updated_at=datetime('now')
               WHERE id=?`
            ).bind(
              repairedDraft.title, repairedDraft.summary, interpretationContent, source.name, credibilityScore,
              repairedDraft.seo_title, repairedDraft.seo_keywords, repairedDraft.seo_description,
              repairedDraft.ai_score, cardSvg, JSON.stringify(repairedDraft.slides), exists.id,
            ).run()
            repaired++
          }
        }
        duplicate++
        continue
      }

      if (plainLength(item.sourceContent || '') < 100) {
        emptySourceContent++
        failedDetails.push('原文正文不足，跳过AI生成：' + item.link)
        continue
      }

      if (plainLength(item.sourceContent || '') >= 120) summaryFallback++
      const rewritten = await aiRewrite(env, item, source.name, aiSettings, aiPromptSettings)
      if (!rewritten) {
        aiFailed++
        failedDetails.push('AI生成失败：' + item.title + ' [' + item.link + ']（详细原因已写入 Worker 日志）')
        continue
      }

      if (!validNewsRewrite(rewritten, item) || rewritten.ai_score < 65) {
        lowScore++
        continue
      }

      const credibilityScore = source.credibility === '高' ? 90 : source.credibility === '低' ? 40 : 70
      const slug = 'news-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
      const cardSvg = rewritten.slides.length ? generateInfographicSvg(rewritten.title, rewritten.slides) : null
      const interpretationContent = buildNewsInterpretationContent(rewritten, item, source.name)

      const inserted = await env.DB.prepare(
        `INSERT INTO articles
          (title, slug, category, summary, content, source_url, source_name, ai_generated, credibility_score,
           status, published_at, seo_title, seo_keywords, seo_description, ai_score, card_svg, slides_json, service_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'pending_review', NULL, ?, ?, ?, ?, ?, ?, NULL)
         RETURNING id`
      ).bind(
        rewritten.title, slug, rewritten.content_type, rewritten.summary,
        interpretationContent,
        item.link, source.name, credibilityScore,
        rewritten.seo_title, rewritten.seo_keywords, rewritten.seo_description, rewritten.ai_score,
        cardSvg, JSON.stringify(rewritten.slides)
      ).first() as any

      created++
      if (executionContext) {
        executionContext.waitUntil(
          syncNewsPageAssociations(env, Number(inserted.id), item, source.name, String(item.sourceContent || ''), aiSettings, false)
            .catch((e) => console.error('sync news city/service/landing pages failed', e))
        )
      } else {
        try {
          await syncNewsPageAssociations(env, Number(inserted.id), item, source.name, String(item.sourceContent || ''), aiSettings)
        } catch (e) {
          console.error('sync news city/service/landing pages failed', e)
        }
      }
      const articleId = Number(inserted.id)
      await env.DB.prepare(
        `INSERT INTO review_logs (article_id, action, operator, note) VALUES (?, ?, 'AI', ?)`
      ).bind(
        inserted.id,
        'pending_review',
        `新闻自动采集：AI独立解读完成并通过内容质量门槛，已进入人工审核；不会自动发布 / 可信度分${credibilityScore} / AI质量分${rewritten.ai_score}`,
      ).run()

    }

    await env.DB.prepare("UPDATE news_sources SET last_fetched_at = datetime('now') WHERE id = ?").bind(source.id).run()
    await logCollection(
      env,
      source.name,
      items.length,
      created,
      published,
      created === 0
        ? `本轮识别到 ${items.length}${sourceAnalysisUsed ? '（使用AI来源页分析）' : ''}：新增 ${created}，修复乱码草稿 ${repaired}，重复 ${duplicate}，AI生成失败 ${aiFailed}，低质量 ${lowScore}，正文抓取为空 ${emptySourceContent}，使用列表/RSS摘要兜底 ${summaryFallback}${failedDetails.length ? '。失败明细：' + failedDetails.slice(0, 4).join('；') : ''}`
        : (aiFailed || lowScore || duplicate || repaired || sourceAnalysisUsed ? `本轮识别 ${items.length}${sourceAnalysisUsed ? '（使用AI来源页分析）' : ''}：新增 ${created}，修复乱码草稿 ${repaired}，重复 ${duplicate}，AI失败 ${aiFailed}，低质量 ${lowScore}${failedDetails.length ? '。失败明细：' + failedDetails.slice(0, 4).join('；') : ''}` : undefined),
    )
  }

  // 新闻采集只生成待审核稿；人工审核通过后，CMS 发布流程负责 Sitemap / 百度 / IndexNow / 内容平台同步。
}
