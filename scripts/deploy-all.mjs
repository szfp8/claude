#!/usr/bin/env node
/**
 * Cloudflare Workers 白标一键部署闭环。
 *
 * 目标：Cloudflare Workers Builds 直接使用当前 Git 仓库作为唯一源码，
 * 在一个全新的 Cloudflare 账号中先完成资源 provisioning，再执行 D1 migrations，
 * 最后重新发布并进行健康检查。
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
  return ['deploy', '--config', 'wrangler.toml']
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
  const match = text.match(/\[\[d1_databases\]\][\s\S]*?^binding\s*=\s*["']([^"']+)["']/m)
  return match?.[1] || 'DB'
}

try {
  // 第一次部署必须先发生：Cloudflare 会根据 wrangler.toml provisioning
  // D1/KV/R2/AI 等资源。不要在这里提前执行 d1 migrations list，
  // 因为全新账号中的 D1 可能尚不存在。
  console.log('→ 首次发布 Worker，并让 Cloudflare 根据 wrangler.toml 准备资源')
  const initial = run(deployArgs(), true)
  const initialOutput = `${initial.stdout || ''}\n${initial.stderr || ''}`
  process.stdout.write(initial.stdout || '')
  process.stderr.write(initial.stderr || '')
  fail(initial, 'Initial deploy')

  console.log('→ 应用 D1 migrations')
  fail(
    run(['d1', 'migrations', 'apply', getD1Binding(), '--remote', '--config', 'wrangler.toml']),
    'D1 migration',
  )

  // migration 改变的是远程数据库，不是 Worker bundle；这里重新发布一次，
  // 确保最终生产部署与迁移后的资源状态一起完成。
  console.log('→ 发布最终 Worker')
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
