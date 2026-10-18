import "dotenv/config";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { createDeliveryWorkerRuntime } from "./runtime";

function readPositiveInteger(
  name: string,
  fallback: number,
): number {
  const value = process.env[name];

  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

const connection = new Redis(
  process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  {
    maxRetriesPerRequest: null,
  },
);

const maxAttempts = readPositiveInteger("RELAY_MAX_ATTEMPTS", 5);
const retryBaseDelayMs = readPositiveInteger(
  "RELAY_RETRY_BASE_DELAY_MS",
  1_000,
);

const worker = createDeliveryWorkerRuntime({
  connection,
  workerId:
    process.env.WORKER_ID ?? `relay-worker-${randomUUID()}`,
  leaseDurationMs: readPositiveInteger(
    "RELAY_LEASE_DURATION_MS",
    30_000,
  ),
  webhookTimeoutMs: readPositiveInteger(
    "RELAY_WEBHOOK_TIMEOUT_MS",
    10_000,
  ),
  retryPolicy: {
    maxAttempts,
    getDelayMs: (attemptNumber) =>
      retryBaseDelayMs * 2 ** Math.max(0, attemptNumber - 1),
  },
});

worker.on("error", () => {
  console.error("Relay delivery worker encountered an infrastructure error");
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Relay delivery worker stopping (${signal})`);

  await worker.close();
  await connection.quit();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

console.log(`Relay delivery worker started as ${worker.name}`);
