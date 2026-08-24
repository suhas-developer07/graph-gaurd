import { describe, it, expect } from "vitest";
import { GRAPH_ENGINE_VERSION } from "./index";

describe("graph-engine", () => {
  it("should export version", () => {
    expect(GRAPH_ENGINE_VERSION).toBe("0.1.0");
  });
});
