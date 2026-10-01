import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const wrangler = fs.readFileSync('wrangler.toml', 'utf8')
const nvmrc = fs.existsSync('.nvmrc') ? fs.readFileSync('.nvmrc', 'utf8').trim() : ''

const expectedScripts = {
  build: 'npm run typecheck',
  predeploy: 'node scripts/predeploy.mjs',
  deploy: 'node scripts/deploy-all.mjs',
  'setup:cloudflare': 'node scripts/setup-cloudflare.mjs',
}

for (const [key, value] of Object.entries(expectedScripts)) {
  if (pkg.scripts?.[key] !== value) {
    console.error(`Deployment check failed: package.json scripts.${key} must be "${value}"`)
    process.exit(1)
  }
}

const REQUIRED_NODE = '26.10.0'
if (pkg.engines?.node !== REQUIRED_NODE) {
  console.error(`Deployment check failed: package.json engines.node must be ${REQUIRED_NODE} (latest Node.js LTS)`)
  process.exit(1)
}
if (nvmrc !== REQUIRED_NODE) {
  console.error(`Deployment check failed: .nvmrc must be ${REQUIRED_NODE}`)
  process.exit(1)
}

const requiredConfig = [
  ['name', /^name\s*=\s*"white-label-cms"\s*$/m],
  ['main', /^main\s*=\s*"src\/index\.ts"\s*$/m],
  ['build command', /\[build\][\s\S]*?command\s*=\s*"npm run build"/],
  ['assets', /directory\s*=\s*"\.\/public"[\s\S]*?binding\s*=\s*"ASSETS"/],
  ['D1 DB binding', /binding\s*=\s*"DB"[\s\S]*?migrations_dir\s*=\s*"migrations"/],
  ['KV binding', /\[\[kv_namespaces\]\][\s\S]*?binding\s*=\s*"CACHE_KV"/],
  ['R2 binding', /\[\[r2_buckets\]\][\s\S]*?binding\s*=\s*"R2_MEDIA"/],
  ['Workers AI binding', /\[ai\][\s\S]*?binding\s*=\s*"AI"/],
]

for (const [label, re] of requiredConfig) {
  if (!re.test(wrangler)) {
    console.error(`Deployment check failed: missing ${label} in wrangler.toml`)
    process.exit(1)
  }
}

if (/database_name\s*=/.test(wrangler)) {
  console.error('Deployment check failed: D1 database_name must be omitted for per-copy automatic provisioning')
  process.exit(1)
}
if (/bucket_name\s*=/.test(wrangler)) {
  console.error('Deployment check failed: R2 bucket_name must be omitted for per-copy automatic provisioning')
  process.exit(1)
}

if (/try-remote-migrate\.mjs/.test(wrangler)) {
  console.error('Deployment check failed: remote D1 migration must not run from wrangler.toml [build]')
  process.exit(1)
}

for (const file of ['scripts/predeploy.mjs', 'scripts/setup-cloudflare.mjs', 'scripts/deploy-all.mjs', 'scripts/postdeploy-check.mjs']) {
  if (!fs.existsSync(file)) {
    console.error(`Deployment check failed: ${file} is missing`)
    process.exit(1)
  }
}

if (fs.existsSync('scripts/deploy.mjs')) {
  console.error('Deployment check failed: obsolete scripts/deploy.mjs must not be present')
  process.exit(1)
}

console.log('Cloudflare deploy OK: white-label worker naming + per-copy resource auto-provisioning + D1 migrations + post-deploy verification; remote migrations run only from deploy-all.mjs; Workers Builds Deploy command must be "npm run deploy"')
