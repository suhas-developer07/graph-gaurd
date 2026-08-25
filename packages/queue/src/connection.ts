import { Queue, Worker } from "bullmq";
import { getEnv } from "@graphguard/config";
import type { QueueJobData } from "./types";

/**
 * Get Redis connection URL for BullMQ.
 */
function getRedisUrl(): string {
  const env = getEnv();
  return env.REDIS_URL;
}

/**
 * Create a BullMQ queue instance.
 */
export function createQueue(name: string): Queue {
  return new Queue(name, {
    connection: {
      url: getRedisUrl(),
    },
  });
}

/**
 * Create a BullMQ worker instance.
 */
export function createWorker<TData extends QueueJobData = QueueJobData>(
  name: string,
  processor: (job: { data: TData; id?: string }) => Promise<unknown>,
  opts?: {
    concurrency?: number;
    limiter?: {
      max: number;
      duration: number;
    };
  },
): Worker<TData> {
  return new Worker<TData>(
    name,
    processor as (job: { data: TData; id?: string }) => Promise<unknown>,
    {
      connection: {
        url: getRedisUrl(),
      },
      concurrency: opts?.concurrency ?? 5,
      limiter: opts?.limiter,
    },
  );
}
