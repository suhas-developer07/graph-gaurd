/**
 * Generate an idempotency key for a job.
 * Format: `{prefix}:{id1}:{id2}`
 * This ensures a retried job doesn't double-write results.
 */
export function idempotencyKey(...parts: string[]): string {
  return parts.join(":");
}

/**
 * Check if a result already exists for this idempotency key.
 * Uses a simple in-memory cache for the current process.
 * In production, this would check Redis or the database.
 */
const processedKeys = new Set<string>();

export function isAlreadyProcessed(key: string): boolean {
  return processedKeys.has(key);
}

export function markAsProcessed(key: string): void {
  processedKeys.add(key);
}

export function clearProcessedCache(): void {
  processedKeys.clear();
}
