#!/usr/bin/env node
/**
 * 白标 CMS 一键部署引导。
 *
 * 复制仓库到新 Cloudflare 环境时，优先使用 CI 注入的 Worker 名称，
 * 避免 wrangler.toml 白标名称覆盖实际部署目标。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const root = process.cwd()
const wrangler = process.platform === 'win32'
  ? join(root, 'node_modules', '.bin', 'wrangler.cmd')
  : join(root, 'node_modules', '.bin', 'wrangler')

function log(msg) {
  console.log(msg)
}

function fail(msg, code = 1) {
  console.error('\n✖ ' + msg)
  process.exit(code)
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  return result
}

log('=== Cloudflare Workers 白标 CMS · setup:cloudflare ===\n')

if (!existsSync(join(root, 'package.json'))) fail('请在仓库根目录执行 npm run setup:cloudflare')
if (!existsSync(wrangler)) fail('未找到 Wrangler，请先执行：npm ci')

const requiredNode = '26.10.0'
if (process.versions.node !== requiredNode) {
  fail(`需要 Node.js ${requiredNode}，当前 ${process.versions.node}`)
}
log(`✔ Node ${process.versions.node}`)

const whoami = run(wrangler, ['whoami'], { capture: true })
if (whoami.status !== 0) fail('尚未登录 Cloudflare，请先执行 npx wrangler login')
log('✔ Wrangler 已登录')

let workerName = process.env.WRANGLER_CI_OVERRIDE_NAME
  || process.env.CLOUDFLARE_WORKER_NAME
  || process.env.WORKER_NAME
  || null

if (workerName) {
  log(`✔ 使用外部部署 Worker 名称：${workerName}`)
} else {
  try {
    const toml = readFileSync(join(root, 'wrangler.toml'), 'utf8')
    workerName = toml.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1] || 'white-label-cms'
  } catch {
    workerName = 'white-label-cms'
  }
  log(`✔ 使用配置 Worker 名称：${workerName}`)
}

log('→ 执行 npm run deploy（资源检查 + D1 migrations + Worker 发布）…\n')
const deploy = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'deploy'])
if (deploy.status !== 0) fail('部署失败，请检查 Cloudflare 日志')

const jwtHint = randomBytes(32).toString('base64url')
const setupHint = randomBytes(16).toString('base64url')

log('\n=== 部署完成 ===\n')
log('建议配置：')
log('npx wrangler secret put JWT_SECRET')
log('npx wrangler secret put SETUP_TOKEN')
log(`JWT 示例：${jwtHint}`)
log(`SETUP 示例：${setupHint}`)
log('')
log('/healthz?probe=1  → 检查 Worker 与 D1')
log('/admin/setup     → 初始化管理员')
log('✔ setup:cloudflare 完成')
