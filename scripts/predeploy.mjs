import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const wrangler = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler')

if (!existsSync(wrangler)) {
  console.error('未找到 Wrangler，请先执行 npm ci 或 npm install')
  process.exit(1)
}

const requiredFiles = [
  'wrangler.toml',
  'scripts/deploy-all.mjs',
]

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    console.error(`部署检查失败：缺少 ${file}`)
    process.exit(1)
  }
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (pkg.scripts?.deploy !== 'node scripts/deploy-all.mjs') {
  console.error('部署检查失败：package.json scripts.deploy 必须使用 node scripts/deploy-all.mjs')
  process.exit(1)
}

console.log('predeploy OK: deploy-all will provision/check D1, apply migrations, then deploy the Worker')
