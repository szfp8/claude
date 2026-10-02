#!/usr/bin/env node
/** Repository integrity check before Cloudflare deployment. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const requiredFiles = ['package.json','package-lock.json','wrangler.toml','src/index.ts','scripts/deploy-all.mjs','scripts/postdeploy-check.mjs','src/utils/protectedSecrets.ts','migrations/0001_init.sql','VERSION','CHANGELOG.md']
const requiredDirs = ['src','public','migrations','scripts','.github/workflows']
let failed = false
function check(label, ok) { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true }
for (const file of requiredFiles) check(`file ${file}`, existsSync(join(root,file)))
for (const dir of requiredDirs) check(`directory ${dir}`, existsSync(join(root,dir)))
try {
  const pkg = JSON.parse(readFileSync(join(root,'package.json'),'utf8'))
  const requiredScripts = ['deploy','doctor','verify','typecheck','build','check:routes','check:public','check:seo-geo','check:deployment','check:migrations','check:whitelabel','check:contact-fields','test']
  for (const script of requiredScripts) check(`npm script ${script}`, Boolean(pkg.scripts?.[script]))
  const versionFile = readFileSync(join(root,'VERSION'),'utf8').trim()
  check('package version matches VERSION', pkg.version === versionFile)
} catch { check('package.json readable', false) }
try {
  const wrangler = readFileSync(join(root,'wrangler.toml'),'utf8')
  check('D1 binding configured', /binding\s*=\s*["']DB["']/.test(wrangler))
  check('D1 database_name configured', /database_name\s*=\s*["']white-label-cms-db["']/.test(wrangler))
  check('D1 migrations configured', /migrations_dir\s*=\s*["']migrations["']/.test(wrangler))
  check('R2 bucket_name configured', /bucket_name\s*=\s*["']white-label-cms-r2-media["']/.test(wrangler))
  check('no hardcoded D1 database_id', !/database_id\s*=\s*["'][^"']+["']/.test(wrangler))
  check('no hardcoded KV id', !(/\[\[kv_namespaces\]\][\s\S]*?\bid\s*=\s*["'][^"']+["']/.test(wrangler)))
} catch { check('wrangler.toml readable', false) }
try {
  const versionFile = readFileSync(join(root,'VERSION'),'utf8').trim()
  check('VERSION readable', Boolean(versionFile))
  const pkg = JSON.parse(readFileSync(join(root,'package.json'),'utf8'))
  check('VERSION matches package version', versionFile === pkg.version)
} catch { check('VERSION readable', false) }
if (failed) { console.error('\nRepository validation failed.'); process.exit(1) }
console.log('\nRepository validation passed.')
