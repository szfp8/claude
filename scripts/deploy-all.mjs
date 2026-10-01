#!/usr/bin/env node
/**
 * Cloudflare Workers 白标一键部署闭环。
 *
 * 目标：Fork 到新的 Cloudflare 账号后，不依赖旧 D1/KV/R2 资源。
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

function run(args, capture = false) {
  const result = spawnSync(wrangler, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
  })
  if (result.error) throw result.error
  return result
}

function deployArgs() {
  const args = ['deploy', '--config', 'wrangler.toml']
  const name = process.env.CLOUDFLARE_WORKER_NAME || process.env.WORKER_NAME
  if (name && !process.env.WRANGLER_CI_OVERRIDE_NAME) args.push('--name', name)
  return args
}

function fail(result, label) {
  if (result.status !== 0) {
    console.error(`${label} failed`)
    console.error(result.stderr || '')
    process.exit(result.status || 1)
  }
}

function getD1Binding() {
  const text = readFileSync(join(root, 'wrangler.toml'), 'utf8')
  return text.match(/binding\s*=\s*["']([^"']+)["']/)?.[1] || 'DB'
}

function findD1() {
  const result = run(['d1', 'list', '--json'], true)
  if (result.status !== 0) return null

  try {
    const dbs = JSON.parse(result.stdout || '[]')
    if (!Array.isArray(dbs)) return null

    const workerName = process.env.WRANGLER_CI_OVERRIDE_NAME || process.env.CLOUDFLARE_WORKER_NAME || process.env.WORKER_NAME
    const candidates = workerName
      ? dbs.filter((db) => db.name?.includes(workerName))
      : []

    return candidates[0] || dbs.find((db) => db.name?.toLowerCase().includes(getD1Binding().toLowerCase())) || null
  } catch {
    return null
  }
}

try {
  const probe = run(['d1', 'migrations', 'list', getD1Binding(), '--remote', '--config', 'wrangler.toml'], true)
  let initialOutput = ''

  if (probe.status !== 0) {
    console.log('D1 尚未就绪，执行首次部署创建 Cloudflare 资源…')
    const first = run(deployArgs(), true)
    initialOutput = `${first.stdout || ''}\n${first.stderr || ''}`
    process.stdout.write(first.stdout || '')
    process.stderr.write(first.stderr || '')
    fail(first, 'Initial deploy')
  }

  const d1 = findD1()
  if (d1) console.log(`Detected D1: ${d1.name} ${d1.uuid || d1.id || ''}`)

  console.log('→ 应用 D1 migrations')
  fail(run(['d1', 'migrations', 'apply', getD1Binding(), '--remote', '--config', 'wrangler.toml']), 'D1 migration')

  console.log('→ 发布 Worker')
  const deploy = run(deployArgs(), true)
  process.stdout.write(deploy.stdout || '')
  process.stderr.write(deploy.stderr || '')
  fail(deploy, 'Worker deploy')

  const output = `${initialOutput}\n${deploy.stdout || ''}\n${deploy.stderr || ''}`
  const check = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'postdeploy:check', '--', output],
    { cwd: root, encoding: 'utf8', stdio: 'inherit', env: process.env },
  )
  fail(check, 'Post deploy check')

  console.log('✔ Cloudflare 一键部署完成')
} catch (error) {
  console.error('deploy-all 失败:', error?.message || error)
  process.exit(1)
}
