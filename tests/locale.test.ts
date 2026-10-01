import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveLocale, enabledLocalesFrom, DEFAULT_LOCALE } from '../src/utils/localeResolve.ts'

test('chinese-only: always zh-CN regardless of browser or cookie', () => {
  const enabled = enabledLocalesFrom([{ code: 'zh-CN', enabled: true }, { code: 'en', enabled: true }])
  assert.deepEqual(enabled, ['zh-CN'])
  assert.equal(resolveLocale(undefined, 'en-US,en;q=0.9', enabled), DEFAULT_LOCALE)
  assert.equal(resolveLocale('en', '', enabled), DEFAULT_LOCALE)
  assert.equal(resolveLocale(undefined, '', enabled), DEFAULT_LOCALE)
})

test('chinese-only: empty or english-only settings still yield zh-CN', () => {
  assert.deepEqual(enabledLocalesFrom([]), ['zh-CN'])
  assert.deepEqual(enabledLocalesFrom(null), ['zh-CN'])
  assert.deepEqual(enabledLocalesFrom([{ code: 'en', enabled: true }]), ['zh-CN'])
})
