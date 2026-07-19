/**
 * Request Logger Middleware
 *
 * Hanya log request yang menghasilkan error (4xx, 5xx).
 * Request sukses (2xx, 3xx) TIDAK ditulis ke log.
 *
 * Format: Laravel-style with full context
 */
import type { Context, Next } from "hono";
import { logger } from "../lib/logger.js";

export async function requestLogger(c: Context, next: Next) {
  const start = Date.now();
  await next();

  const status = c.res.status;

  // Skip successful responses — only log errors
  if (status < 400) return;

  const method = c.req.method;
  const path = c.req.path;
  const duration = Date.now() - start;
  const ip =
    c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";

  // Extract error details from response body
  let responseBody: Record<string, any> = {};
  try {
    const clonedRes = c.res.clone();
    responseBody = (await clonedRes.json()) as Record<string, any>;
  } catch {}

  // Build a synthetic error from the response for proper logging
  const errorMsg =
    responseBody.message || responseBody.error || `HTTP ${status}`;
  const syntheticError = new Error(errorMsg);
  (syntheticError as any).name =
    responseBody.error ||
    (status >= 500 ? "InternalServerError" : "ClientError");
  (syntheticError as any).status = status;

  const ctx = {
    error: syntheticError,
    request: {
      method,
      path,
      ip,
      query: c.req.query(),
    },
    tags: [
      `status:${status}`,
      `http`,
      status >= 500 ? "server-error" : "client-error",
    ],
    extra: {
      statusCode: status,
      durationMs: duration,
      responseBody,
    },
  };

  if (status >= 500) {
    logger.error(
      `${method} ${path} [${status}] ${duration}ms — ${errorMsg}`,
      ctx,
    );
  } else {
    logger.warning(
      `${method} ${path} [${status}] ${duration}ms — ${errorMsg}`,
      ctx,
    );
  }
}
