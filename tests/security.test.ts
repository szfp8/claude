import test from 'node:test'
import assert from 'node:assert/strict'
import { isSafeAdminMutationRequest } from '../src/middleware/security.ts'

test('allows same-origin admin mutations', () => {
  const request = new Request('https://example.com/admin/settings', {
    method: 'POST',
    headers: { Origin: 'https://example.com', 'Sec-Fetch-Site': 'same-origin' },
  })
  assert.equal(isSafeAdminMutationRequest(request), true)
})

test('rejects cross-site fetch metadata', () => {
  const request = new Request('https://example.com/admin/settings', {
    method: 'POST',
    headers: { Origin: 'https://example.com', 'Sec-Fetch-Site': 'cross-site' },
  })
  assert.equal(isSafeAdminMutationRequest(request), false)
})

test('rejects mismatched origin even with same-origin fetch metadata', () => {
  const request = new Request('https://example.com/admin/settings', {
    method: 'POST',
    headers: { Origin: 'https://attacker.example', 'Sec-Fetch-Site': 'same-origin' },
  })
  assert.equal(isSafeAdminMutationRequest(request), false)
})

test('rejects scheme mismatch for an otherwise identical host', () => {
  const request = new Request('https://example.com/admin/settings', {
    method: 'POST',
    headers: { Origin: 'http://example.com', 'Sec-Fetch-Site': 'same-origin' },
  })
  assert.equal(isSafeAdminMutationRequest(request), false)
})

test('does not block safe methods or non-admin paths', () => {
  assert.equal(isSafeAdminMutationRequest(new Request('https://example.com/contact', { method: 'POST' })), true)
  assert.equal(isSafeAdminMutationRequest(new Request('https://example.com/admin/login', { method: 'GET' })), true)
})

test('rejects cross-origin contact form posts', () => {
  const request = new Request('https://example.com/contact', {
    method: 'POST',
    headers: { Origin: 'https://attacker.example', 'Sec-Fetch-Site': 'cross-site' },
  })
  assert.equal(isSafeAdminMutationRequest(request), false)
})
