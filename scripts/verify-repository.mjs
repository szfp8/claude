#!/usr/bin/env node
/**
 * Repository integrity check before Cloudflare deployment.
 *
 * Checks the files that are required for a fresh fork deployment.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

const requiredFiles = [
  'package.json',
  'wrangler.toml',
  'src/index.ts',
  'scripts/deploy-all.mjs',
]

const requiredDirs = [
  'src',
  'public',
  'migrations',
  'scripts',
]

let failed = false

function check(label, ok) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failed = true
}

for (const file of requiredFiles) {
  check(`file ${file}`, existsSync(join(root, file)))
}

for (const dir of requiredDirs) {
  check(`directory ${dir}`, existsSync(join(root, dir)))
}

try {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  check('deploy script exists', Boolean(pkg.scripts?.deploy))
  check('typecheck script exists', Boolean(pkg.scripts?.typecheck))
} catch {
  check('package.json readable', false)
}

try {
  const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8')
  check('D1 binding configured', /binding\s*=\s*["']DB["']/.test(wrangler))
  check('D1 database name configured', /database_name\s*=/.test(wrangler))
} catch {
  check('wrangler.toml readable', false)
}

if (failed) {
  console.error('\nRepository validation failed.')
  process.exit(1)
}

console.log('\nRepository validation passed.')
