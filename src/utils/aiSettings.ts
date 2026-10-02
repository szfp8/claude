import type { Bindings } from '../types'
import { getProtectedSecret } from './protectedSecrets'

export type AiProviderType = 'workers_ai' | 'openai_compatible'

export const DEFAULT_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'
export const DEFAULT_AI_TEMPERATURE = 0.6
export const DEFAULT_AI_MAX_TOKENS = 2048
export const DEFAULT_AI_TIMEOUT_MS = 20000
export const DEFAULT_AI_ENABLED = true
export const DEFAULT_AI_PROVIDER: AiProviderType = 'workers_ai'

export const AI_MODEL_OPTIONS = [
  { id: '@cf/meta/llama-3.1-8b-instruct-fast', label: 'Llama 3.1 8B Fast（当前默认）', note: '速度快，适合批量新闻/城市/服务/文章生成' },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B Fast', note: '更强的长文本理解与生成能力，资源消耗更高' },
  { id: '@cf/meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', note: '新一代多模态模型，可用于较复杂内容生成' },
  { id: '@cf/meta/llama-3.1-8b-instruct-fp8', label: 'Llama 3.1 8B FP8', note: '标准 Cloudflare 托管版本' },
] as const

export type AiSettings = {
  enabled: boolean
  provider: AiProviderType
  model: string
  temperature: number
  maxTokens: number
  externalBaseUrl: string
  externalModel: string
  externalTimeoutMs: number
  fallbackEnabled: boolean
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizeModel(value: unknown): string {
  const model = String(value || '').trim().slice(0, 180)
  if (/^@(cf|hf)\/[A-Za-z0-9._/@:-]+$/.test(model)) return model
  return DEFAULT_AI_MODEL
}

function normalizeExternalBaseUrl(value: unknown): string {
  const raw = String(value || '').trim().replace(/\/+$/, '')
  if (!raw || raw.length > 500) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return ''
    if (url.username || url.password || url.search || url.hash) return ''
    if (/^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)) return ''
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname)) return ''
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname)) return ''
    if (url.hostname === '0.0.0.0' || url.hostname.startsWith('[') || url.hostname === '::1' || url.hostname.startsWith('fc') || url.hostname.startsWith('fd')) return ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function normalizeExternalModel(value: unknown): string {
  return String(value || '').trim().replace(/[^A-Za-z0-9._:@/-]/g, '').slice(0, 180)
}

function normalizeProvider(value: unknown): AiProviderType {
  return value === 'openai_compatible' ? 'openai_compatible' : DEFAULT_AI_PROVIDER
}

export function normalizeAiSettings(input: Partial<AiSettings> & {
  customModel?: unknown
  aiProvider?: unknown
  externalModel?: unknown
  externalBaseUrl?: unknown
  externalTimeoutMs?: unknown
  fallbackEnabled?: unknown
}): AiSettings {
  const selected = String(input.model || '').trim()
  const custom = String(input.customModel || '').trim()
  return {
    enabled: input.enabled !== false,
    provider: normalizeProvider(input.provider || input.aiProvider),
    model: normalizeModel(custom || selected || DEFAULT_AI_MODEL),
    temperature: Number(clampNumber(input.temperature, 0, 5, DEFAULT_AI_TEMPERATURE).toFixed(2)),
    maxTokens: Math.round(clampNumber(input.maxTokens, 256, 4096, DEFAULT_AI_MAX_TOKENS)),
    externalBaseUrl: normalizeExternalBaseUrl(input.externalBaseUrl),
    externalModel: normalizeExternalModel(input.externalModel),
    externalTimeoutMs: Math.round(clampNumber(input.externalTimeoutMs, 5000, 60000, DEFAULT_AI_TIMEOUT_MS)),
    fallbackEnabled: input.fallbackEnabled === true,
  }
}

export async function getAiSettings(env: Pick<Bindings, 'DB'>): Promise<AiSettings> {
  const defaults = normalizeAiSettings({})
  try {
    const rows = (await env.DB.prepare(
      "SELECT key, value FROM settings WHERE key IN ('ai_enabled','ai_provider','ai_model','ai_temperature','ai_max_tokens','ai_external_base_url','ai_external_model','ai_external_timeout_ms','ai_fallback_enabled')"
    ).all()).results as any[]
    const map: Record<string, string> = {}
    for (const row of rows) map[String(row.key)] = String(row.value ?? '')
    return normalizeAiSettings({
      enabled: map.ai_enabled === '' ? defaults.enabled : map.ai_enabled !== '0',
      aiProvider: map.ai_provider || defaults.provider,
      model: map.ai_model || defaults.model,
      temperature: Number(map.ai_temperature || defaults.temperature),
      maxTokens: Number(map.ai_max_tokens || defaults.maxTokens),
      externalBaseUrl: map.ai_external_base_url || '',
      externalModel: map.ai_external_model || '',
      externalTimeoutMs: Number(map.ai_external_timeout_ms || defaults.externalTimeoutMs),
      fallbackEnabled: map.ai_fallback_enabled === '1',
    })
  } catch (e) {
    console.error('AI settings load failed, using defaults', e)
    return defaults
  }
}

export async function saveAiSettings(env: Pick<Bindings, 'DB'>, input: Partial<AiSettings>): Promise<AiSettings> {
  const settings = normalizeAiSettings(input)
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('ai_enabled', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(settings.enabled ? '1' : '0'),
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('ai_provider', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(settings.provider),
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('ai_model', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(settings.model),
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('ai_temperature', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(settings.temperature)),
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('ai_max_tokens', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(settings.maxTokens)),
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('ai_external_base_url', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(settings.externalBaseUrl),
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('ai_external_model', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(settings.externalModel),
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('ai_external_timeout_ms', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(settings.externalTimeoutMs)),
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('ai_fallback_enabled', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(settings.fallbackEnabled ? '1' : '0'),
  ])
  return settings
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function throwOnAiFailure(result: unknown, model: string): void {
  if (!result || typeof result !== 'object') return
  const value = result as any
  if (value.success === false || value.error || (Array.isArray(value.errors) && value.errors.length > 0)) {
    const detail = value.error || value.errors?.[0]?.message || value.errors?.[0] || value.message || '模型返回失败状态'
    throw new Error(`AI 调用失败（模型 ${model}）：${errorText(detail).slice(0, 600)}`)
  }
}

async function runWorkersAi(env: Pick<Bindings, 'AI'>, input: Record<string, unknown>, config: AiSettings): Promise<any> {
  if (!env.AI || typeof (env.AI as any).run !== 'function') {
    throw new Error('Workers AI binding “AI” 未在当前 Worker 运行环境生效，请检查生产环境 Binding 并重新部署。')
  }
  const payload = {
    ...input,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
  } as any
  const result = await env.AI.run(config.model, payload)
  throwOnAiFailure(result, config.model)
  return result
}

async function runOpenAiCompatible(env: Pick<Bindings, 'DB' | 'CACHE_KV' | 'JWT_SECRET' | 'EXTERNAL_AI_API_KEY'>, input: Record<string, unknown>, config: AiSettings): Promise<any> {
  const apiKey = (await getProtectedSecret(env, 'EXTERNAL_AI_API_KEY')) || String(env.EXTERNAL_AI_API_KEY || '').trim()
  if (!apiKey) throw new Error('外部 AI API Key 未配置。请进入后台「AI设置」填写；也可使用 Cloudflare Secret EXTERNAL_AI_API_KEY 作为兼容兜底。')
  if (!config.externalBaseUrl) throw new Error('外部 AI API 地址未配置或不是 HTTPS 公网地址。')
  if (!config.externalModel) throw new Error('外部 AI 模型名称未配置。')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.externalTimeoutMs)
  try {
    const messages = Array.isArray(input.messages)
      ? input.messages
      : [{ role: 'user', content: String(input.prompt || '') }]
    const payload = {
      model: config.externalModel,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }

    const response = await fetch(config.externalBaseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const raw = await response.text()
    if (raw.length > 512 * 1024) throw new Error('外部 AI 响应过大，已拒绝解析。')
    let data: any = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = { error: raw.slice(0, 800) }
    }
    if (!response.ok) {
      const detail = String(data?.error?.message || data?.error || data?.message || '').trim()
      throw new Error(`外部 AI API HTTP ${response.status}：${detail || '请求失败'}`)
    }
    if (!data || (!data.choices?.length && !data.response && !data.output_text && !data.text)) {
      throw new Error('外部 AI API 返回成功，但未找到可识别的模型文本。')
    }
    return data
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw new Error('外部 AI API 请求超时。')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function runConfiguredAi(
  env: Pick<Bindings, 'DB' | 'AI' | 'CACHE_KV' | 'JWT_SECRET' | 'EXTERNAL_AI_API_KEY'>,
  input: Record<string, unknown>,
  settings?: AiSettings,
): Promise<any | null> {
  const config = settings || await getAiSettings(env)
  if (!config.enabled) return null

  const primary = config.provider === 'openai_compatible' ? 'external' : 'workers'
  const fallback = config.fallbackEnabled ? (primary === 'workers' ? 'external' : 'workers') : null
  const attempts = fallback ? [primary, fallback] : [primary]
  let lastError: unknown = null

  for (const provider of attempts) {
    try {
      if (provider === 'workers') return await runWorkersAi(env, input, config)
      return await runOpenAiCompatible(env, input, config)
    } catch (error) {
      lastError = error
      console.error('AI provider call failed', {
        provider,
        model: provider === 'workers' ? config.model : config.externalModel,
        fallbackEnabled: Boolean(fallback),
        message: errorText(error).slice(0, 400),
      })
      if (!fallback) throw error instanceof Error ? error : new Error(errorText(error))
    }
  }

  throw lastError instanceof Error ? lastError : new Error(errorText(lastError))
}
