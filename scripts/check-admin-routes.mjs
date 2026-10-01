import { readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { cwd, exit } from 'node:process'

const root = cwd()
const snapshotPath = join(root, 'scripts', 'admin-routes.snapshot.json')
const routeFileRoot = join(root, 'src', 'routes')
const rootAdminFile = join(routeFileRoot, 'admin.ts')
const splitAdminRoot = join(routeFileRoot, 'admin')

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function listRouteFiles(dir) {
  const files = []
  if (!existsSync(dir)) return files
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await listRouteFiles(full))
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
  }
  return files
}

function normalizeExpression(expr) {
  return expr
    .replace(/\s+/g, ' ')
    .replace(/\s*\+\s*/g, ' + ')
    .trim()
}

function joinRoutePath(prefix, path) {
  const left = String(prefix || '').trim().replace(/\/+$/, '')
  const right = String(path || '').trim()
  if (!left || left === '/') return right || '/'
  if (!right || right === '/') return left || '/'
  return left + '/' + right.replace(/^\/+/, '')
}

function expandRoute(method, expr, prefix) {
  const normalized = normalizeExpression(expr)
  const dynamicGroup = normalized.includes("'/page-images/' + group + '/:slug'")
  const dynamicDelete = normalized.includes("'/page-images/' + group + '/:slug/delete'")
  if (dynamicGroup) {
    return [
      { method, path: joinRoutePath(prefix, '/page-images/city/:slug') },
      { method, path: joinRoutePath(prefix, '/page-images/service/:slug') },
    ]
  }
  if (dynamicDelete) {
    return [
      { method, path: joinRoutePath(prefix, '/page-images/city/:slug/delete') },
      { method, path: joinRoutePath(prefix, '/page-images/service/:slug/delete') },
    ]
  }

  const literal = normalized.match(/^['"](\/[^'"]*)['"]$/)
  if (literal) return [{ method, path: joinRoutePath(prefix, literal[1]) }]
  return [{ method, path: joinRoutePath(prefix, '[dynamic:' + normalized + ']') }]
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const base = join(dirname(fromFile), specifier)
  const candidates = [
    base,
    base + '.ts',
    base + '.tsx',
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) || null
}

function readImports(source, file) {
  const imports = new Map()
  let match

  const namedRe = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g
  while ((match = namedRe.exec(source))) {
    const target = resolveImport(file, match[2])
    if (!target) continue
    for (const item of match[1].split(',')) {
      const part = item.trim()
      if (!part) continue
      const bits = part.split(/\s+as\s+/)
      const imported = bits[0].trim()
      const local = (bits[1] || imported).trim()
      imports.set(local, target)
    }
  }

  const defaultRe = /import\s+([A-Za-z0-9_$]+)\s+from\s*['"]([^'"]+)['"]/g
  while ((match = defaultRe.exec(source))) {
    const target = resolveImport(file, match[2])
    if (target) imports.set(match[1], target)
  }

  const namespaceRe = /import\s*\*\s*as\s+([A-Za-z0-9_$]+)\s*from\s*['"]([^'"]+)['"]/g
  while ((match = namespaceRe.exec(source))) {
    const target = resolveImport(file, match[2])
    if (target) imports.set(match[1], target)
  }

  return imports
}

async function collectFromModule(file, routerName, prefix, stack, unresolvedMounts, routes) {
  const key = relative(root, file) + '::' + routerName + '::' + prefix
  if (stack.has(key)) return
  stack.add(key)

  const source = await readFile(file, 'utf8')
  const routerRe = new RegExp('\\b' + escapeRegExp(routerName) + '\\.(get|post|put|patch|delete)\\(([^,\n]+),', 'g')
  let match
  while ((match = routerRe.exec(source))) {
    routes.push(...expandRoute(match[1].toUpperCase(), match[2], prefix))
  }

  const imports = readImports(source, file)
  const mountRe = /\b([A-Za-z0-9_$]+)\.route\(\s*['"]([^'"]*)['"]\s*,\s*([A-Za-z0-9_$]+)\s*\)/g
  while ((match = mountRe.exec(source))) {
    if (match[1] !== routerName) continue
    const childRouter = match[3]
    const childFile = imports.get(childRouter)
    if (!childFile) {
      unresolvedMounts.push({
        file: relative(root, file).split(sep).join('/'),
        mount: match[0],
        reason: 'unable to resolve imported route module',
      })
      continue
    }
    await collectFromModule(
      childFile,
      childRouter,
      joinRoutePath(prefix, match[2] || '/'),
      stack,
      unresolvedMounts,
      routes,
    )
  }

  stack.delete(key)
}

async function collect() {
  if (!existsSync(rootAdminFile)) throw new Error('Missing src/routes/admin.ts')

  const routes = []
  const unresolvedMounts = []
  await collectFromModule(rootAdminFile, 'adminRoutes', '', new Set(), unresolvedMounts, routes)

  // Split modules are traversed only when they are mounted through adminRoutes.route(...).
  // An unmounted module is not an active admin route and is therefore intentionally absent from the snapshot.


  const seen = new Map()
  const duplicates = []
  for (const route of routes) {
    const key = route.method + ' ' + route.path
    if (seen.has(key)) duplicates.push({ key, first: seen.get(key), duplicate: route })
    else seen.set(key, route)
  }

  const normalized = Array.from(seen.keys()).sort().map((key) => {
    const [method, ...rest] = key.split(' ')
    return { method, path: rest.join(' ') }
  })
  return { routes: normalized, duplicates, unresolvedMounts }
}

const current = await collect()
if (!current.routes.length) {
  console.error('No admin routes found.')
  exit(1)
}
if (current.unresolvedMounts.length) {
  console.error('Unresolved admin route mounts:')
  console.error(JSON.stringify(current.unresolvedMounts, null, 2))
  exit(1)
}
if (current.duplicates.length) {
  console.error('Duplicate admin routes found:')
  console.error(JSON.stringify(current.duplicates, null, 2))
  exit(1)
}

if (process.argv.includes('--update')) {
  await writeFile(snapshotPath, JSON.stringify(current.routes, null, 2) + '\n')
  console.log('Updated ' + relative(root, snapshotPath))
  exit(0)
}

if (!existsSync(snapshotPath)) {
  console.error('Missing route snapshot: ' + relative(root, snapshotPath))
  console.error('Run: node scripts/check-admin-routes.mjs --update')
  exit(1)
}

const expected = JSON.parse(await readFile(snapshotPath, 'utf8'))
const actualText = JSON.stringify(current.routes)
const expectedText = JSON.stringify(expected)
if (actualText !== expectedText) {
  console.error('Admin route snapshot mismatch.')
  console.error('Expected: ' + expectedText)
  console.error('Actual: ' + actualText)
  console.error('Run --update only when a route change is intentional, then review the snapshot diff.')
  exit(1)
}

console.log('Admin route snapshot OK: ' + current.routes.length + ' routes')
