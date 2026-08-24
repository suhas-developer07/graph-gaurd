import { describe, it, expect } from "vitest";
import { REGRESSION_VERSION } from "./index";

describe("regression", () => {
  it("should export version", () => {
    expect(REGRESSION_VERSION).toBe("0.1.0");
  });
});
