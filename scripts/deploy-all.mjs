#!/usr/bin/env node
/**
 * Cloudflare Workers 白标一键部署闭环。
 *
 * 一次执行 npm run deploy 即完成：
 *   1) 检查远程 D1 是否已经存在
 *   2) 首次部署时让 Wrangler 自动创建当前 Worker 对应的 D1/KV/R2/AI 资源
 *   3) 立即应用全部远程 D1 migrations
 *   4) 再发布一次已经完成数据库初始化的 Worker
 *   5) 自动执行部署后验收；若存在 workers.dev URL，再执行 /healthz?probe=1
 *
 * Workers Builds 连接已有 Worker 时由 Cloudflare 提供
 * WRANGLER_CI_OVERRIDE_NAME，因此仓库不再绑定 claude 这个项目名。
 */
import { existsSync } from 'node:fs'
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
  if (explicitName && !process.env.WRANGLER_CI_OVERRIDE_NAME) {
    args.push('--name', explicitName)
  }
  return args
}

function exitWith(result, label) {
  if (result.status !== 0) {
    console.error(`${label} failed (exit ${result.status ?? 'unknown'})`)
    if (result.stderr) console.error(result.stderr)
    process.exit(result.status || 1)
  }
}

try {
  const probe = run(['d1', 'migrations', 'list', 'DB', '--remote', '--config', 'wrangler.toml'], { capture: true })

  let initialDeployOutput = ''
  if (probe.status !== 0) {
    console.log('D1 尚未就绪，先部署一次以自动创建当前 Worker 所需资源（D1/KV/R2/AI）…')
    const firstDeploy = run(deployArgs(), { capture: true })
    initialDeployOutput = [firstDeploy.stdout || '', firstDeploy.stderr || ''].join('\\n')
    process.stdout.write(firstDeploy.stdout || '')
    process.stderr.write(firstDeploy.stderr || '')
    exitWith(firstDeploy, 'Initial resource provisioning deploy')
  }

  console.log('→ 应用远程 D1 migrations…')
  const migrate = run(['d1', 'migrations', 'apply', 'DB', '--remote', '--yes', '--config', 'wrangler.toml'])
  exitWith(migrate, 'D1 migration')

  console.log('→ 发布已完成数据库初始化的 Worker…')
  const deploy = run(deployArgs(), { capture: true })
  process.stdout.write(deploy.stdout || '')
  process.stderr.write(deploy.stderr || '')
  exitWith(deploy, 'Final Worker deploy')

  const deployOutput = [initialDeployOutput, deploy.stdout || '', deploy.stderr || ''].join('\n')
  console.log('→ 执行部署后自动验收/初始化检查…')
  const postcheck = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'postdeploy:check', '--', deployOutput],
    { cwd: root, encoding: 'utf8', stdio: 'inherit', shell: process.platform === 'win32', env: process.env },
  )
  if (postcheck.status !== 0) {
    console.error('部署后验收失败：Worker 已发布，但初始化/健康检查未通过')
    process.exit(postcheck.status || 1)
  }

  console.log('✔ Cloudflare 一键部署闭环完成：Worker + D1 migration + 自动验收全部通过')
} catch (error) {
  console.error('deploy-all 失败：', error?.message || error)
  process.exit(1)
}
