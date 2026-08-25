/**
 * Structured JSON logger with sensitive content redaction.
 * Logs are NDJSON (one JSON object per line) for easy parsing.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  traceId?: string;
  jobId?: string;
  runId?: string;
  [key: string]: unknown;
}

/**
 * Sensitive patterns to redact from logs.
 */
const SENSITIVE_PATTERNS = [
  /password/gi,
  /token/gi,
  /api[_-]?key/gi,
  /secret/gi,
  /authorization/gi,
];

/**
 * Truncate long strings in log content.
 */
function truncateContent(value: unknown, maxLen: number = 200): unknown {
  if (typeof value === "string" && value.length > maxLen) {
    return value.slice(0, maxLen) + `... [truncated, ${value.length} chars]`;
  }
  return value;
}

/**
 * Redact sensitive fields from an object.
 */
function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = SENSITIVE_PATTERNS.some((p) => p.test(key));

    if (isSensitive && typeof value === "string") {
      redacted[key] = "***REDACTED***";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      redacted[key] = redactSensitive(value as Record<string, unknown>);
    } else if (typeof value === "string") {
      redacted[key] = truncateContent(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Create a structured logger.
 */
export function createLogger(service: string) {
  function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service,
      ...redactSensitive(meta),
    };

    const line = JSON.stringify(entry);

    if (level === "error") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }

  return {
    debug: (message: string, meta?: Record<string, unknown>) => log("debug", message, meta),
    info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
    error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
