import { describe, it, expect } from "vitest";
import { RateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  it("allows tokens up to max", () => {
    const limiter = new RateLimiter(5, 100); // 5 tokens, fast refill

    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false); // Exhausted
  });

  it("refills tokens over time", async () => {
    const limiter = new RateLimiter(2, 10); // 2 tokens, 10/sec refill

    // Exhaust
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);

    // Wait for refill
    await new Promise((r) => setTimeout(r, 150));

    expect(limiter.tryConsume()).toBe(true);
  });
});
