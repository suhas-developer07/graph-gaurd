import { describe, it, expect, beforeEach } from "vitest";
import { idempotencyKey, isAlreadyProcessed, markAsProcessed, clearProcessedCache } from "./idempotency";

describe("idempotency", () => {
  beforeEach(() => {
    clearProcessedCache();
  });

  it("generates correct idempotency keys", () => {
    expect(idempotencyKey("run-1", "tc-001")).toBe("run-1:tc-001");
    expect(idempotencyKey("eval", "run-1", "tc-001")).toBe("eval:run-1:tc-001");
  });

  it("tracks processed keys", () => {
    const key = idempotencyKey("run-1", "tc-001");

    expect(isAlreadyProcessed(key)).toBe(false);

    markAsProcessed(key);
    expect(isAlreadyProcessed(key)).toBe(true);
  });

  it("clears processed cache", () => {
    const key = idempotencyKey("run-1", "tc-001");
    markAsProcessed(key);
    expect(isAlreadyProcessed(key)).toBe(true);

    clearProcessedCache();
    expect(isAlreadyProcessed(key)).toBe(false);
  });

  it("different keys are independent", () => {
    const key1 = idempotencyKey("run-1", "tc-001");
    const key2 = idempotencyKey("run-1", "tc-002");

    markAsProcessed(key1);
    expect(isAlreadyProcessed(key1)).toBe(true);
    expect(isAlreadyProcessed(key2)).toBe(false);
  });
});
