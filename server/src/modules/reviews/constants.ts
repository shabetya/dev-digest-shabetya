/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

/**
 * Intent Layer. Confidence below this threshold is surfaced to the UI as
 * "low confidence" (`PrIntentRecord.low_confidence`) — a fixed cutoff rather
 * than something the LLM decides for itself, so the signal is comparable
 * across runs/models.
 */
export const INTENT_LOW_CONFIDENCE_THRESHOLD = 0.5;

