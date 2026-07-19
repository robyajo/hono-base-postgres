import fs from "node:fs";
import path from "node:path";
import type { Server } from "bun";

/**
 * Ensures public storage and log directories exist.
 */
export function ensureStorageDirs(): void {
  const targetStorageDir = path.resolve("src/storage/app/public/avatars");
  if (!fs.existsSync(targetStorageDir)) {
    fs.mkdirSync(targetStorageDir, { recursive: true });
  }

  const logDir = path.resolve("src/storage/log");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

/**
 * Configures process signal handlers for graceful server and database shutdown.
 */
export function setupGracefulShutdown(server: Server<any>, connectionPool: { end: () => Promise<void> }): void {
  function shutdown(signal: string) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.stop(true);
    connectionPool.end().then(() => {
      console.log("Database connections closed. Exiting.");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 3000);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
