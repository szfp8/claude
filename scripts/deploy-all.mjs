#!/usr/bin/env node
/**
 * Cloudflare Workers 白标一键部署闭环。
 *
 * npm run deploy:
 * 1) 检查 D1 状态
 * 2) 首次部署创建 Cloudflare 资源
 * 3) 校验实际 D1 resource 与 DB binding
 * 4) 执行 migrations
 * 5) 发布并验收 Worker
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const wrangler = process.platform === 'win32'
  ? join(root, 'node_modules', '.bin', 'wrangler.cmd')
  : join(root, 'node_modules', '.bin', 'wrangler')

if (!existsSync(wrangler)) {
  console.error('未找到 Wrangler，请先执行 npm ci')
  process.exit(1)
}

function run(args, options = {}) {
  const result = spawnSync(wrangler, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
  })
  if (result.error) throw result.error
  return result
}

function deployArgs() {
  const args = ['deploy', '--config', 'wrangler.toml']
  const explicitName = process.env.CLOUDFLARE_WORKER_NAME || process.env.WORKER_NAME
  if (explicitName && !process.env.WRANGLER_CI_OVERRIDE_NAME) args.push('--name', explicitName)
  return args
}

function exitWith(result, label) {
  if (result.status !== 0) {
    console.error(`${label} failed (exit ${result.status ?? 'unknown'})`)
    if (result.stderr) console.error(result.stderr)
    process.exit(result.status || 1)
  }
}

function readWranglerD1Config() {
  try {
    const config = readFileSync(join(root, 'wrangler.toml'), 'utf8')
    const name = config.match(/database_name\s*=\s*["']([^"']+)["']/)?.[1]
    const binding = config.match(/binding\s*=\s*["']([^"']+)["']/)?.[1]
    return {
      databaseName: name,
      binding: binding || 'DB',
    }
  } catch {
    return { databaseName: null, binding: 'DB' }
  }
}

function getProvisionedD1() {
  const result = run(['d1', 'list', '--json'], { capture: true })
  if (result.status !== 0) return null

  try {
    const dbs = JSON.parse(result.stdout || '[]')
    const config = readWranglerD1Config()
    if (!Array.isArray(dbs)) return null

    // Fresh Cloudflare accounts may contain unrelated D1 databases.
    // Always prefer the configured database_name over fuzzy binding matches.
    if (config.databaseName) {
      const exact = dbs.find((db) => db.name === config.databaseName)
      if (exact) return exact
    }

    const binding = config.binding.toLowerCase()
    return dbs.find((db) => db.name?.toLowerCase().includes(binding)) || null
  } catch {
    return null
  }
}

function validateD1Resource() {
  const d1 = getProvisionedD1()
  if (!d1) {
    console.error('Cloudflare D1 resource 未找到，请检查 database_name 和 DB binding 配置')
    process.exit(1)
  }
  if (!d1.uuid && !d1.id) {
    console.error('Cloudflare D1 database_id 缺失，无法执行 migration')
    process.exit(1)
  }
  console.log(`Detected provisioned D1: ${d1.name || 'unknown'} ${d1.uuid || d1.id}`)
  return d1
}

try {
  const probe = run(['d1', 'migrations', 'list', 'DB', '--remote', '--config', 'wrangler.toml'], { capture: true })
  let initialDeployOutput = ''

  if (probe.status !== 0) {
    console.log('D1 尚未就绪，先部署一次创建 Cloudflare 资源…')
    const firstDeploy = run(deployArgs(), { capture: true })
    initialDeployOutput = [firstDeploy.stdout || '', firstDeploy.stderr || ''].join('\n')
    process.stdout.write(firstDeploy.stdout || '')
    process.stderr.write(firstDeploy.stderr || '')
    exitWith(firstDeploy, 'Initial resource provisioning deploy')
  }

  validateD1Resource()

  console.log('→ 应用远程 D1 migrations…')
  const migrate = run(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', 'wrangler.toml'])
  exitWith(migrate, 'D1 migration')

  console.log('→ 发布已完成数据库初始化的 Worker…')
  const deploy = run(deployArgs(), { capture: true })
  process.stdout.write(deploy.stdout || '')
  process.stderr.write(deploy.stderr || '')
  exitWith(deploy, 'Final Worker deploy')

  const deployOutput = [initialDeployOutput, deploy.stdout || '', deploy.stderr || ''].join('\n')
  console.log('→ 执行部署后自动验收检查…')
  const postcheck = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'postdeploy:check', '--', deployOutput],
    { cwd: root, encoding: 'utf8', stdio: 'inherit', shell: process.platform === 'win32', env: process.env },
  )
  if (postcheck.status !== 0) {
    console.error('部署后验收失败')
    process.exit(postcheck.status || 1)
  }

  console.log('✔ Cloudflare 一键部署闭环完成')
} catch (error) {
  console.error('deploy-all 失败：', error?.message || error)
  process.exit(1)
}
