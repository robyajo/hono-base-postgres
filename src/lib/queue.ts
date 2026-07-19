/**
 * Optional BullMQ-based task queue for background processing.
 *
 * If REDIS_ENABLED=true in .env, connects to Redis and processes background jobs via BullMQ.
 * If REDIS_ENABLED=false (default), provides safe fallback helpers to run handlers without Redis.
 */

import { Queue, Worker, type Job } from "bullmq";
import { env } from "../config/drizzle.js";
import { logger } from "./logger.js";

/**
 * Returns Redis connection options for BullMQ
 */
export const getRedisConnectionOptions = () => ({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

/**
 * Creates a BullMQ Queue safely if Redis is enabled.
 * Returns null if REDIS_ENABLED=false.
 */
export function createQueue<T = any>(queueName: string): Queue<T> | null {
  if (!env.REDIS_ENABLED) {
    return null;
  }

  try {
    const queue = new Queue<T>(queueName, {
      connection: getRedisConnectionOptions(),
    });
    logger.info(`✅ Redis Queue "${queueName}" initialized on ${env.REDIS_HOST}:${env.REDIS_PORT}`);
    return queue;
  } catch (error) {
    logger.error(`❌ Failed to initialize Redis Queue "${queueName}"`, { error: error as Error });
    return null;
  }
}

/**
 * Creates a BullMQ Worker safely if Redis is enabled.
 * Returns null if REDIS_ENABLED=false.
 */
export function createWorker<T = any>(
  queueName: string,
  processor: (job: Job<T>) => Promise<any>
): Worker<T> | null {
  if (!env.REDIS_ENABLED) {
    return null;
  }

  try {
    const worker = new Worker<T>(queueName, processor, {
      connection: getRedisConnectionOptions(),
    });

    worker.on("completed", (job) => {
      logger.info(`✅ Job "${job.name}" (${job.id}) completed on queue "${queueName}"`);
    });

    worker.on("failed", (job, err) => {
      logger.error(`❌ Job "${job?.name}" (${job?.id}) failed on queue "${queueName}"`, { error: err });
    });

    return worker;
  } catch (error) {
    logger.error(`❌ Failed to initialize Redis Worker for "${queueName}"`, { error: error as Error });
    return null;
  }
}

/**
 * Safely adds a job to a queue if Redis is enabled, or executes fallback if disabled.
 */
export async function addJob<T = any>(
  queue: Queue<T> | null,
  jobName: string,
  data: T,
  fallbackHandler?: (data: T) => Promise<any>
): Promise<Job<T> | null> {
  if (env.REDIS_ENABLED && queue) {
    return (await queue.add(jobName as any, data as any)) as unknown as Job<T>;
  }

  if (fallbackHandler) {
    logger.info(`ℹ️ [Fallback] Executing job "${jobName}" synchronously (Redis disabled).`);
    await fallbackHandler(data);
  }
  return null;
}
