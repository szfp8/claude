#!/usr/bin/env node
/**
 * 白标 CMS 本地一键部署引导。
 *
 * 用法：
 *   npm ci
 *   npx wrangler login
 *   npm run setup:cloudflare
 *
 * 作用：
 *   1. 检查 Node / Wrangler / 登录状态
 *   2. 执行 npm run deploy（predeploy 会预配 D1/KV/R2 并应用 migrations）
 *   3. 打印后续 Secret 与 /admin/setup 步骤
 *
 * 不会：
 *   - 把真实密钥写入 Git
 *   - 自动调用 Cloudflare API 写入 Secret（请用 wrangler secret put）
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

if (!existsSync(join(root, 'package.json'))) {
  fail('请在仓库根目录执行 npm run setup:cloudflare')
}
if (!existsSync(wrangler)) {
  fail('未找到 Wrangler，请先执行：npm ci')
}

const requiredNode = '26.10.0'
const currentNode = process.versions.node
if (currentNode !== requiredNode) {
  fail(`需要 Node.js ${requiredNode}，当前 ${currentNode}。请按 .nvmrc / .node-version 切换后重试。`)
}
log(`✔ Node ${currentNode}`)

const whoami = run(wrangler, ['whoami'], { capture: true })
if (whoami.status !== 0) {
  fail('尚未登录 Cloudflare。请先执行：\n  npx wrangler login')
}
log('✔ Wrangler 已登录')

let workerName = process.env.CLOUDFLARE_WORKER_NAME || process.env.WORKER_NAME || process.env.WRANGLER_CI_OVERRIDE_NAME || 'white-label-cms'
try {
  const toml = readFileSync(join(root, 'wrangler.toml'), 'utf8')
  const m = toml.match(/^name\s*=\s*["']([^"']+)["']/m)
  if (m) workerName = m[1]
} catch {
  // ignore
}
if (process.env.WRANGLER_CI_OVERRIDE_NAME) {
  log(`✔ Workers Builds 已提供目标 Worker：${workerName}`)
} else if (!process.env.CLOUDFLARE_WORKER_NAME && !process.env.WORKER_NAME) {
  log('\n提示：当前使用白标默认 Worker 名 white-label-cms。')
  log('  本地复制部署可设置 CLOUDFLARE_WORKER_NAME=你的-worker-名称；')
  log('  Cloudflare Workers Builds 连接已有 Worker 时会自动匹配 Dashboard Worker。\n')
}

log('→ 执行 npm run deploy（含 predeploy：资源预配 + D1 migrations）…\n')
const deploy = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'deploy'])
if (deploy.status !== 0) {
  fail('部署失败。请查看上方日志；也可查阅 docs/CF-SETUP-TROUBLESHOOTING.md')
}

const jwtHint = randomBytes(32).toString('base64url')
const setupHint = randomBytes(16).toString('base64url')

log('\n=== 部署完成 · 建议立即配置 ===\n')
log('1) 生产 Secret（可选但强烈建议）：')
log(`   npx wrangler secret put JWT_SECRET`)
log(`   npx wrangler secret put SETUP_TOKEN`)
log('   （可把下面随机串粘贴为值，勿提交到 Git）')
log(`   JWT 示例：${jwtHint}`)
log(`   SETUP 示例：${setupHint}`)
log('')
log('2) 浏览器访问：')
log('   /healthz?probe=1     → ok / d1_schema 应为 true')
log('   /admin/setup         → 创建管理员（若配置了 SETUP_TOKEN 需填写）')
log('   /admin/settings      → 站点名称、行业、Footer、联系方式')
log('   /admin/modules       → 导航顺序、语言、联系渠道')
log('   /admin/pages         → 六页标签与正文')
log('')
log('3) 密码规则：至少 10 位，两类字符；Free 计划建议 10–20 位。')
log('')
log('✔ setup:cloudflare 流程结束')
