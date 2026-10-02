#!/usr/bin/env node
/**
 * 部署后自动验收。
 *
 * 远程 D1 migration 已由 deploy-all.mjs 在发布前应用；
 * 这里不再重复调用 d1 migrations list，避免把“部署已成功”再次变成
 * 一个额外的 D1 API 权限门槛。若有 workers.dev URL，则继续调用
 * /healthz?probe=1，验证 D1 schema、KV、R2、AI、Assets 与运行态。
 *
 * 使用自定义域名或关闭 workers.dev 时，可设置 DEPLOY_SMOKE_URL，
 * 让同一部署闭环执行完整 HTTP 验收。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const wrangler = process.platform === 'win32'
  ? join(root, 'node_modules', '.bin', 'wrangler.cmd')
  : join(root, 'node_modules', '.bin', 'wrangler')

const deployOutput = process.argv.slice(2).join(' ')
const smokeUrl = process.env.DEPLOY_SMOKE_URL || extractUrl(deployOutput)

if (!existsSync(wrangler)) {
  console.error('✖ postdeploy:check：未找到 Wrangler')
  process.exit(1)
}

function extractUrl(text) {
  const matches = text.match(/https:\/\/[^\s"'<>]+\.workers\.dev(?:\/[^\s"'<>]*)?/g) || []
  return matches.at(-1) || ''
}

function fail(message, result) {
  console.error(`✖ ${message}`)
  if (result?.stdout) console.error(result.stdout)
  if (result?.stderr) console.error(result.stderr)
  process.exit(1)
}

if (!smokeUrl) {
  console.log('ℹ 未检测到 workers.dev URL；自定义域名部署可设置 DEPLOY_SMOKE_URL 自动执行 HTTP 验收。')
  console.log('✔ 部署后检查完成（未执行 HTTP smoke check）')
  process.exit(0)
}

const base = smokeUrl.replace(/\/$/, '')
console.log(`→ HTTP smoke check: ${base}/healthz?probe=1`)
try {
  const response = await fetch(base + '/healthz?probe=1', { redirect: 'follow' })
  const body = await response.text()
  if (!response.ok) fail(`healthz 返回 HTTP ${response.status}`, { stdout: body })

  let data
  try { data = JSON.parse(body) } catch { fail('healthz 返回不是 JSON', { stdout: body }) }

  const bindings = data.bindings || {}
  const requiredBindings = ['DB', 'CACHE_KV', 'R2_MEDIA', 'AI', 'ASSETS']
  const missingBindings = requiredBindings.filter((name) => bindings[name] !== true)
  if (!data.ok || data.d1_schema !== true || missingBindings.length > 0) {
    fail(
      `Worker 健康检查未通过：D1 schema/bindings 尚未完成初始化${missingBindings.length ? `；缺少 ${missingBindings.join(', ')}` : ''}`,
      { stdout: JSON.stringify(data, null, 2) },
    )
  }

  console.log(JSON.stringify({
    ok: data.ok,
    bindings: data.bindings,
    d1_schema: data.d1_schema,
    missing_tables: data.missing_tables,
    probe: data.probe,
  }, null, 2))
  console.log('✔ Worker HTTP post-deploy health check OK')
} catch (error) {
  fail(`Worker HTTP post-deploy check failed: ${String(error)}`)
}
