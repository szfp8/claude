export type NewsPublishStatus = 'published' | 'pending_review'

export type ArticleWriteStatus = 'draft' | 'pending_review' | 'published'

export type NewsPublishDecision = {
  status: NewsPublishStatus
  reason: 'human_review_required' | 'quality_checks_failed' | 'quality_score_below_threshold'
}

export const MIN_NEWS_QUALITY_SCORE = 65

/** AI/collector output never becomes public without an explicit human publish action. */
export function statusAfterAiDraft(requestedStatus: unknown): ArticleWriteStatus {
  return requestedStatus === 'draft' ? 'draft' : 'pending_review'
}

/** Backward-compatible decision helper: automatic publication is intentionally not supported. */
export function decideNewsStatus(input: {
  autoPublish?: boolean
  qualityScore: number
  checksPassed: boolean
}): NewsPublishDecision {
  if (!input.checksPassed) {
    return { status: 'pending_review', reason: 'quality_checks_failed' }
  }

  if (Number(input.qualityScore || 0) < MIN_NEWS_QUALITY_SCORE) {
    return { status: 'pending_review', reason: 'quality_score_below_threshold' }
  }

  return { status: 'pending_review', reason: 'human_review_required' }
}
