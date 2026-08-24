import { describe, it, expect, beforeEach } from "vitest";
import { getEnv, resetEnv } from "./index";

describe("packages/config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetEnv();
    process.env = { ...originalEnv };
  });

  it("should return valid env when all vars are set", () => {
    process.env.DATABASE_URL = "postgres://localhost:5432/graphguard";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.GROQ_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.NODE_ENV = "development";
    process.env.PORT = "4000";

    const env = getEnv();
    expect(env.DATABASE_URL).toBe("postgres://localhost:5432/graphguard");
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
    expect(env.GROQ_API_KEY).toBe("test-key");
    expect(env.GEMINI_API_KEY).toBe("test-key");
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(4000);
  });

  it("should throw when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.GROQ_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "test-key";

    expect(() => getEnv()).toThrow("Invalid environment configuration");
  });

  it("should throw when GROQ_API_KEY is empty", () => {
    process.env.DATABASE_URL = "postgres://localhost:5432/graphguard";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.GROQ_API_KEY = "";
    process.env.GEMINI_API_KEY = "test-key";

    expect(() => getEnv()).toThrow("Invalid environment configuration");
  });

  it("should default NODE_ENV to development and PORT to 4000", () => {
    process.env.DATABASE_URL = "postgres://localhost:5432/graphguard";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.GROQ_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.NODE_ENV;
    delete process.env.PORT;

    const env = getEnv();
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(4000);
  });
});
