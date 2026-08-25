/**
 * Simple token bucket rate limiter.
 * Used to respect Groq's free-tier rate limits.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume a token. Returns true if allowed, false if rate limited.
   */
  tryConsume(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Wait until a token is available.
   */
  async waitForToken(): Promise<void> {
    while (!this.tryConsume()) {
      const waitTime = Math.ceil((1 - this.tokens) / this.refillRate * 1000);
      await new Promise((resolve) => setTimeout(resolve, Math.max(waitTime, 100)));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

/**
 * Groq free-tier rate limiter.
 * Conservative limits: 30 requests per minute for llama-3.1-8b-instant.
 */
export const groqRateLimiter = new RateLimiter(30, 0.5);

/**
 * Gemini free-tier rate limiter.
 * Conservative limits: 15 requests per minute for embeddings.
 */
export const geminiRateLimiter = new RateLimiter(15, 0.25);
