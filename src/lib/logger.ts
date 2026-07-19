/**
 * Laravel-Style Logger
 *
 * Supports all log levels: emergency, alert, critical, error, warning, notice, info, debug
 * Logs include: timestamp, level, file/line, stack trace, context, environment
 *
 * Format (similar to Laravel):
 *   [2026-07-07 10:00:00] local.ERROR: Title {"context":"..."}
 *   {"exception":"[object] (Error(message) at file:line)"}
 *   [stacktrace]
 *   Error: message
 *       at functionName (file:line:col)
 *       ...
 */
import fs from "node:fs";
import path from "node:path";

const logDir = path.resolve("src", "storage", "log");
const logFile = path.join(logDir, "log.log");

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ─── Log Levels ─────────────────────────────────────────────────────────────
export type LogLevel =
  | "emergency"
  | "alert"
  | "critical"
  | "error"
  | "warning"
  | "notice"
  | "info"
  | "debug";

// Numeric priority for filtering
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7,
};

const LOG_LEVEL_CONSOLE: Record<LogLevel, "error" | "warn" | "log" | "debug"> =
  {
    emergency: "error",
    alert: "error",
    critical: "error",
    error: "error",
    warning: "warn",
    notice: "log",
    info: "log",
    debug: "debug",
  };

// ─── Helpers ────────────────────────────────────────────────────────────────
function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * Extract file and line from Error stack trace.
 * Returns { file, line, column, function } from the first non-internal frame.
 */
function extractErrorLocation(
  error: Error,
): { file: string; line: number; column: number; fn: string } | null {
  if (!error.stack) return null;

  const stackLines = error.stack.split("\n");
  // Skip first line (error message), look for "at ..." lines
  for (const line of stackLines) {
    const match = line.trim().match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
    if (match) {
      return {
        fn: match[1],
        file: match[2],
        line: parseInt(match[3]),
        column: parseInt(match[4]),
      };
    }
    // Anonymous function: "at file:line:col"
    const anonMatch = line.trim().match(/at\s+(.+?):(\d+):(\d+)/);
    if (anonMatch) {
      return {
        fn: "<anonymous>",
        file: anonMatch[1],
        line: parseInt(anonMatch[2]),
        column: parseInt(anonMatch[3]),
      };
    }
  }
  return null;
}

/**
 * Get the full stack trace as a clean string
 */
function getStackTrace(error: Error): string {
  return error.stack || `${error.name}: ${error.message}`;
}

/**
 * Categorize error type (like Laravel exception classification)
 */
function categorizeError(error: Error): string {
  const name = error.name || "";
  const msg = error.message || "";
  const lowerMsg = msg.toLowerCase();

  if (name === "HTTPException" || name === "HTTPException")
    return "HTTP Exception";
  if (name === "TypeError") return "TypeError";
  if (name === "ReferenceError") return "ReferenceError";
  if (name === "SyntaxError") return "SyntaxError";
  if (name === "RangeError") return "RangeError";

  // Database errors
  if (
    lowerMsg.includes("er_conn") ||
    (lowerMsg.includes("connection") && lowerMsg.includes("database"))
  )
    return "Database Connection Error";
  if (lowerMsg.includes("er_dup") || lowerMsg.includes("duplicate"))
    return "Duplicate Entry Error";
  if (
    lowerMsg.includes("sql") ||
    lowerMsg.includes("query") ||
    (lowerMsg.includes("column") && lowerMsg.includes("does not exist"))
  )
    return "SQL Exception";
  if (
    lowerMsg.includes("er_no_such_table") ||
    (lowerMsg.includes("table") && lowerMsg.includes("doesn't exist"))
  )
    return "Table Not Found";
  if (lowerMsg.includes("lock wait timeout") || lowerMsg.includes("deadlock"))
    return "Database Lock Error";

  // Redis errors
  if (
    lowerMsg.includes("redis") ||
    (lowerMsg.includes("econnrefused") && lowerMsg.includes("6380"))
  )
    return "Redis Exception";

  // Auth errors
  if (
    name === "UnauthorizedError" ||
    lowerMsg.includes("unauthorized") ||
    (lowerMsg.includes("token") && lowerMsg.includes("invalid"))
  )
    return "Authentication Exception";
  if (lowerMsg.includes("forbidden") || lowerMsg.includes("permission denied"))
    return "Authorization Exception";

  // Validation
  if (
    name === "ZodError" ||
    lowerMsg.includes("validation") ||
    lowerMsg.includes("invalid input")
  )
    return "Validation Exception";

  // Network / HTTP
  if (
    name === "FetchError" ||
    lowerMsg.includes("fetch") ||
    lowerMsg.includes("econnreset") ||
    lowerMsg.includes("etimedout")
  )
    return "HTTP Client Exception";

  // File system
  if (
    name === "ENOENT" ||
    lowerMsg.includes("enoent") ||
    lowerMsg.includes("no such file")
  )
    return "Filesystem Exception (File Not Found)";
  if (
    name === "EACCES" ||
    lowerMsg.includes("eacces") ||
    lowerMsg.includes("permission denied")
  )
    return "Filesystem Exception (Permission Denied)";
  if (lowerMsg.includes("storage") || lowerMsg.includes("upload"))
    return "Filesystem Exception";

  // OpenAI / AI
  if (
    lowerMsg.includes("openai") ||
    lowerMsg.includes("rate limit") ||
    lowerMsg.includes("429")
  )
    return "AI/HTTP Client Exception";

  // GDrive
  if (
    lowerMsg.includes("google") ||
    lowerMsg.includes("gdrive") ||
    lowerMsg.includes("drive")
  )
    return "Google Drive Exception";

  // Queue / BullMQ
  if (
    lowerMsg.includes("bull") ||
    lowerMsg.includes("queue") ||
    lowerMsg.includes("job")
  )
    return "Queue Exception";

  // Process / memory
  if (
    lowerMsg.includes("heap") ||
    lowerMsg.includes("out of memory") ||
    lowerMsg.includes("allocation")
  )
    return "Out of Memory Error";

  // Abort (timeout / client disconnect)
  if (
    name === "AbortError" ||
    lowerMsg.includes("aborted") ||
    lowerMsg.includes("econnreset")
  )
    return "Request Aborted / Timeout";

  return name || "Error";
}

// ─── Core Write Function ────────────────────────────────────────────────────
interface LogContext {
  error?: Error;
  request?: {
    method: string;
    path: string;
    ip?: string;
    userId?: string;
    query?: Record<string, any>;
  };
  tags?: string[];
  extra?: Record<string, any>;
}

function formatLogEntry(
  level: LogLevel,
  message: string,
  ctx?: LogContext,
): string {
  const timestamp = getTimestamp();
  const env = process.env.NODE_ENV || "local";

  // Header line
  const header = `[${timestamp}] ${env}.${level.toUpperCase()}: ${message}`;

  const parts: string[] = [header];

  if (ctx?.error) {
    const err = ctx.error;
    const location = extractErrorLocation(err);
    const category = categorizeError(err);

    // Exception object (Laravel-style)
    const locationStr = location
      ? ` at ${location.file}:${location.line}:${location.column}`
      : "";
    parts.push(
      `{"exception":"[object] (${err.name || "Error"}(code: 0): ${err.message}${locationStr})"}`,
    );

    // Stack trace
    parts.push(`[stacktrace]`);
    parts.push(getStackTrace(err));
    parts.push(`[/stacktrace]`);

    // Category & location metadata
    parts.push(
      `[context] {"category":"${category}"${location ? `,"file":"${location.file}","line":${location.line},"column":${location.column},"function":"${location.fn}"` : ""}}`,
    );
  }

  if (ctx?.request) {
    const req = ctx.request;
    const reqParts: Record<string, any> = {
      method: req.method,
      url: req.path,
    };
    if (req.ip) reqParts.ip = req.ip;
    if (req.userId) reqParts.user_id = req.userId;
    if (req.query && Object.keys(req.query).length > 0)
      reqParts.query = req.query;
    parts.push(`[request] ${JSON.stringify(reqParts)}`);
  }

  if (ctx?.tags?.length) {
    parts.push(`[tags] ${ctx.tags.join(", ")}`);
  }

  if (ctx?.extra) {
    parts.push(`[extra] ${JSON.stringify(ctx.extra)}`);
  }

  return parts.join("\n") + "\n";
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function writeLog(
  level: "INFO" | "ERROR" | "WARN",
  message: string,
  error?: Error,
) {
  // Map old API to new
  const mappedLevel: LogLevel =
    level === "ERROR" ? "error" : level === "WARN" ? "warning" : "info";
  log(mappedLevel, message, { error });
}

export function log(level: LogLevel, message: string, ctx?: LogContext) {
  const entry = formatLogEntry(level, message, ctx);

  // Console output
  const consoleFn = LOG_LEVEL_CONSOLE[level];
  if (ctx?.error) {
    console[consoleFn](
      `[${level.toUpperCase()}] ${message}`,
      ctx.error.stack || ctx.error.message,
    );
  } else {
    console[consoleFn](`[${level.toUpperCase()}] ${message}`);
  }

  // File output
  fs.appendFile(logFile, entry, (err) => {
    if (err) console.error("[LOGGER] Failed to write to log file:", err);
  });
}

// ─── Convenience Methods ────────────────────────────────────────────────────
export const logger = {
  emergency: (message: string, ctx?: LogContext) =>
    log("emergency", message, ctx),
  alert: (message: string, ctx?: LogContext) => log("alert", message, ctx),
  critical: (message: string, ctx?: LogContext) =>
    log("critical", message, ctx),
  error: (message: string, ctx?: LogContext) => log("error", message, ctx),
  warning: (message: string, ctx?: LogContext) => log("warning", message, ctx),
  notice: (message: string, ctx?: LogContext) => log("notice", message, ctx),
  info: (message: string, ctx?: LogContext) => log("info", message, ctx),
  debug: (message: string, ctx?: LogContext) => log("debug", message, ctx),
};

// ─── Process-Level Error Handlers ───────────────────────────────────────────
// Captures unhandled exceptions, unhandled rejections, and warnings
// (must be called after this module is imported)

export function registerProcessErrorHandlers() {
  process.on("uncaughtException", (error: Error) => {
    logger.emergency("Uncaught Exception — Process may terminate", {
      error,
      tags: ["uncaughtException", "process"],
      extra: { pid: process.pid, uptime: process.uptime() },
    });
    // Give time for async log write before exit
    setTimeout(() => process.exit(1), 1000);
  });

  process.on("unhandledRejection", (reason: any) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.critical("Unhandled Promise Rejection", {
      error,
      tags: ["unhandledRejection", "promise"],
      extra: { pid: process.pid },
    });
  });

  process.on("warning", (warning: Error) => {
    logger.warning(`Node.js Warning: ${warning.name}`, {
      error: warning,
      tags: ["nodeWarning"],
    });
  });

  process.on("exit", (code: number) => {
    if (code !== 0) {
      log("emergency", `Process exited with code ${code}`, {
        tags: ["processExit"],
        extra: { exitCode: code, pid: process.pid },
      });
    }
  });
}
