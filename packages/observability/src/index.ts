import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry with a console exporter for local development.
 * Call this once at application startup.
 */
export function initTelemetry(serviceName: string = "graphguard"): void {
  if (sdk) return;

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter: new ConsoleSpanExporter(),
  });

  sdk.start();
}

/**
 * Shut down the telemetry SDK gracefully.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}

/**
 * Get a tracer for creating spans.
 */
export function getTracer(name: string = "graphguard") {
  return trace.getTracer(name);
}

export { trace, context, SpanStatusCode };
