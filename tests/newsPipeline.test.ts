import test from 'node:test'
import assert from 'node:assert/strict'
import { decideNewsStatus, MIN_NEWS_QUALITY_SCORE, statusAfterAiDraft } from '../src/services/newsPipeline.ts'

test('quality-passing news remains pending until a human publishes it', () => {
  assert.equal(MIN_NEWS_QUALITY_SCORE, 65)
  assert.deepEqual(
    decideNewsStatus({ autoPublish: true, qualityScore: 65, checksPassed: true }),
    { status: 'pending_review', reason: 'human_review_required' },
  )
})

test('failed quality checks remain pending', () => {
  assert.deepEqual(
    decideNewsStatus({ autoPublish: true, qualityScore: 99, checksPassed: false }),
    { status: 'pending_review', reason: 'quality_checks_failed' },
  )
})

test('low-quality content remains pending', () => {
  assert.deepEqual(
    decideNewsStatus({ autoPublish: true, qualityScore: 64, checksPassed: true }),
    { status: 'pending_review', reason: 'quality_score_below_threshold' },
  )
})

test('AI-filled article content cannot be published directly', () => {
  assert.equal(statusAfterAiDraft('published'), 'pending_review')
  assert.equal(statusAfterAiDraft('pending_review'), 'pending_review')
  assert.equal(statusAfterAiDraft('draft'), 'draft')
})
