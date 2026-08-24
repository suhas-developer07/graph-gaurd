import { describe, it, expect } from "vitest";
import { LLM_VERSION } from "./index";

describe("llm", () => {
  it("should export version", () => {
    expect(LLM_VERSION).toBe("0.1.0");
  });
});
