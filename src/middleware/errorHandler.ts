/**
 * Global Error Handler
 *
 * Catches all unhandled errors in route handlers and logs them with full context:
 * - Error name, message, stack trace, file/line
 * - Request method, path, IP, user ID
 * - Error category (database, redis, auth, validation, etc.)
 */
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../lib/logger.js";

export const errorHandler = (err: Error, c: Context) => {
  const method = c.req.method;
  const path = c.req.path;
  const ip =
    c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";

  let status = 500;
  let message = err.message || "An unexpected error occurred";
  let errorName = err.name || "InternalServerError";

  if (err instanceof HTTPException) {
    status = err.status;
    message = err.message;
    errorName = err.name === "Error" ? "HTTPException" : err.name;
  } else if (c.res.status !== 200 && c.res.status) {
    status = c.res.status;
  }

  const ctx = {
    error: err,
    request: { method, path, ip },
    tags: [`status:${status}`, `http`],
    extra: {
      statusCode: status,
      userAgent: c.req.header("user-agent") || "unknown",
    },
  };

  // Use appropriate log level based on status
  if (status >= 500) {
    logger.error(`${method} ${path} [${status}] ${errorName}: ${message}`, ctx);
  } else if (status >= 400) {
    logger.warning(
      `${method} ${path} [${status}] ${errorName}: ${message}`,
      ctx,
    );
  } else {
    logger.error(`${method} ${path} [${status}] ${errorName}: ${message}`, ctx);
  }

  return c.json(
    {
      error: errorName,
      message,
      status,
    },
    status as any,
  );
};
