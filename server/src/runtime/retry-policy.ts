import type { RetryPolicy, DEFAULT_RETRY_POLICY } from '../planner/dag-types.js';

const DEFAULT: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  useJitter: true,
};

export function getRetryPolicy(nodePolicy?: RetryPolicy): RetryPolicy {
  return nodePolicy || DEFAULT;
}

export function calculateDelay(attempt: number, policy: RetryPolicy): number {
  // Exponential backoff
  let delay = policy.baseDelayMs * Math.pow(2, attempt - 1);

  // Cap at max delay
  delay = Math.min(delay, policy.maxDelayMs);

  // Add jitter (±25%)
  if (policy.useJitter) {
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    delay += jitter;
  }

  return Math.max(0, Math.round(delay));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  onRetry?: (attempt: number, error: Error, delay: number) => void
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < policy.maxAttempts) {
        const delay = calculateDelay(attempt, policy);
        onRetry?.(attempt, lastError, delay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}
