import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import type { Hono } from "hono";
import { env } from "../config/drizzle.js";
import { logger } from "./logger.js";

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

export { websocket };

/**
 * Registers WebSocket routes on Hono app if WS_ENABLED=true in .env
 */
export function setupWebSocketRoutes(app: Hono<any>): void {
  if (!env.WS_ENABLED) {
    return;
  }

  const wsPath = env.WS_PATH || "/ws";

  app.get(
    wsPath,
    upgradeWebSocket(() => ({
      onOpen(_evt, ws) {
        logger.info("📡 [WebSocket] Client connected!");
        ws.send(
          JSON.stringify({
            event: "connected",
            message: "Connected to Hono + Bun WebSocket server!",
            timestamp: new Date().toISOString(),
          }),
        );
      },
      onMessage(evt, ws) {
        logger.info(`📡 [WebSocket] Message received: ${evt.data}`);
        let parsedData: any = evt.data;
        try {
          parsedData = JSON.parse(String(evt.data));
        } catch {}

        // Echo back message with timestamp
        ws.send(
          JSON.stringify({
            event: "message_ack",
            received: parsedData,
            timestamp: new Date().toISOString(),
          }),
        );
      },
      onClose() {
        logger.info("📡 [WebSocket] Client disconnected.");
      },
      onError(evt) {
        logger.error("📡 [WebSocket] Connection error", { error: evt as any });
      },
    })),
  );

  logger.info(`✅ WebSocket server mounted on path: ${wsPath}`);
}
