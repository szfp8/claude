import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const wrangler = fs.readFileSync('wrangler.toml', 'utf8')
const nvmrc = fs.existsSync('.nvmrc') ? fs.readFileSync('.nvmrc', 'utf8').trim() : ''
const expectedScripts = {
  build: 'npm run typecheck', predeploy: 'node scripts/predeploy.mjs', deploy: 'node scripts/deploy-all.mjs',
  'check:routes': 'node scripts/check-admin-routes.mjs', 'check:public': 'node scripts/check-public-routes.mjs', 'check:seo-geo': 'node scripts/check-seo-geo.mjs',
  'check:migrations': 'node scripts/check-migrations.mjs', 'check:whitelabel': 'node scripts/check-white-label.mjs', 'check:contact-fields': 'node scripts/check-contact-fields.mjs',
}
for (const [key,value] of Object.entries(expectedScripts)) if (pkg.scripts?.[key] !== value) { console.error(`Deployment check failed: package.json scripts.${key} must be "${value}"`); process.exit(1) }
const REQUIRED_NODE = '26.10.0'
if (pkg.engines?.node !== REQUIRED_NODE || nvmrc !== REQUIRED_NODE) { console.error('Deployment check failed: Node must be 26.10.0 in package.json and .nvmrc'); process.exit(1) }
const requiredConfig = [
 ['name', /^name\s*=\s*"white-label-cms"\s*$/m], ['main', /^main\s*=\s*"src\/index\.ts"\s*$/m], ['build command', /\[build\][\s\S]*?command\s*=\s*"npm run build"/],
 ['assets', /directory\s*=\s*"\.\/public"[\s\S]*?binding\s*=\s*"ASSETS"/], ['D1 DB binding', /\[\[d1_databases\]\][\s\S]*?binding\s*=\s*"DB"[\s\S]*?database_name\s*=\s*"white-label-cms-db"[\s\S]*?migrations_dir\s*=\s*"migrations"/],
 ['KV binding', /\[\[kv_namespaces\]\][\s\S]*?binding\s*=\s*"CACHE_KV"/], ['R2 binding', /\[\[r2_buckets\]\][\s\S]*?binding\s*=\s*"R2_MEDIA"[\s\S]*?bucket_name\s*=\s*"white-label-cms-r2-media"/], ['Workers AI binding', /\[ai\][\s\S]*?binding\s*=\s*"AI"/],
]
for (const [label,re] of requiredConfig) if (!re.test(wrangler)) { console.error(`Deployment check failed: missing ${label} in wrangler.toml`); process.exit(1) }
if (/database_id\s*=/.test(wrangler) && !/database_id\s*=\s*""/.test(wrangler)) { console.error('Deployment check failed: database_id must not be hardcoded'); process.exit(1) }
if (/\[\[kv_namespaces\]\][\s\S]*?\bid\s*=\s*["'][^"']+["']/.test(wrangler)) { console.error('Deployment check failed: KV id must not be hardcoded'); process.exit(1) }
if (/try-remote-migrate\.mjs/.test(wrangler)) { console.error('Deployment check failed: remote migration must not run from [build]'); process.exit(1) }
for (const file of ['scripts/predeploy.mjs','scripts/deploy-all.mjs','scripts/postdeploy-check.mjs']) if (!fs.existsSync(file)) { console.error(`Deployment check failed: ${file} is missing`); process.exit(1) }
if (fs.existsSync('scripts/deploy.mjs')) { console.error('Deployment check failed: obsolete scripts/deploy.mjs must not be present'); process.exit(1) }
console.log('Cloudflare deploy configuration OK')
