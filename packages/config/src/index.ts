import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgres", {
    message: "DATABASE_URL must be a valid PostgreSQL connection string",
  }),
  REDIS_URL: z.string().url().startsWith("redis", {
    message: "REDIS_URL must be a valid Redis connection string",
  }),
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Validate and return the application environment configuration.
 * Fails fast with a clear error if any required variable is missing.
 * Caches the result so subsequent calls don't re-validate.
 */
export function getEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const errors = Object.entries(formatted)
      .filter(([key]) => key !== "_errors")
      .map(([key, value]) => {
        const errs = (value as { _errors?: string[] })?._errors;
        return errs && errs.length > 0 ? `  ${key}: ${errs.join(", ")}` : null;
      })
      .filter(Boolean)
      .join("\n");

    throw new Error(
      `❌ Invalid environment configuration:\n${errors}\n\nCheck your .env file or environment variables.`,
    );
  }

  _env = result.data;
  return _env;
}

/**
 * Reset the cached env (useful in tests).
 */
export function resetEnv(): void {
  _env = null;
}

export { envSchema };
