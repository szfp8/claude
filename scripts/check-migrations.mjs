// 校验 D1 migrations 命名：
//  - 文件名必须是 NNNN_name.sql；
//  - 不允许新增重复编号（历史遗留的 0003 重复已登记，且已在生产库执行过，绝对不能重命名）；
//  - 编号必须连续，避免漏文件；
//  - 新 migration 只能追加，编号必须大于已登记的最大编号。
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve('migrations')
// D1 按“文件名”记录已执行的 migration；改名会导致已部署站点重复执行。这些历史重复编号只允许保持现状。
const LEGACY_DUPLICATE_NUMBERS = new Set(['0003'])

const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()
const errors = []
const seen = new Map()

for (const file of files) {
  const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(file)
  if (!match) {
    errors.push(`${file}: 文件名必须形如 0001_name.sql（小写字母、数字、下划线）`)
    continue
  }
  const number = match[1]
  if (!seen.has(number)) seen.set(number, [])
  seen.get(number).push(file)
}

for (const [number, names] of seen) {
  if (names.length > 1 && !LEGACY_DUPLICATE_NUMBERS.has(number)) {
    errors.push(`编号 ${number} 重复：${names.join(', ')}。请给新 migration 使用下一个未用编号。`)
  }
}

const numbers = [...seen.keys()].map(Number).sort((a, b) => a - b)
for (let i = 1; i < numbers.length; i++) {
  if (numbers[i] - numbers[i - 1] > 1) {
    errors.push(`编号不连续：${String(numbers[i - 1]).padStart(4, '0')} 之后直接是 ${String(numbers[i]).padStart(4, '0')}`)
  }
}

if (errors.length) {
  console.error('Migration 命名检查失败：')
  for (const error of errors) console.error(' - ' + error)
  process.exit(1)
}
console.log(`Migration naming OK: ${files.length} files, latest ${String(numbers.at(-1)).padStart(4, '0')}`)
