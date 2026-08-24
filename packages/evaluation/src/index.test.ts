import { describe, it, expect } from "vitest";
import { EVALUATION_VERSION } from "./index";

describe("evaluation", () => {
  it("should export version", () => {
    expect(EVALUATION_VERSION).toBe("0.1.0");
  });
});
