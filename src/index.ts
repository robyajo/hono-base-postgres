import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import apiRouter from "./routes/index.js";
import type { AuthVariables } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import {
  logger,
  registerProcessErrorHandlers,
} from "./lib/logger.js";
import { serveStatic } from "hono/bun";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { env, isDev } from "./config/drizzle.js";
import { connectionPool } from "./db/index.js";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Register process-level error handlers (uncaughtException, unhandledRejection, etc.)
registerProcessErrorHandlers();

const app = new Hono<{
  Variables: AuthVariables;
}>();

// Mount secure headers middleware globally
app.use(secureHeaders());

// Request logger — logs ALL requests/responses to storage/log/log.log
app.use(requestLogger);

// Ensure public storage directory exists
const targetStorageDir = path.resolve("src/storage/app/public/avatars");
if (!fs.existsSync(targetStorageDir)) {
  fs.mkdirSync(targetStorageDir, { recursive: true });
}

// Serve public storage assets statically under /storage/*
app.use(
  "/storage/*",
  cors({
    origin: env.ALLOWED_ORIGINS.split(","),
    credentials: true,
  }),
  serveStatic({
    root: "./src/storage/app/public",
    rewriteRequestPath: (p: string) => p.replace(/^\/storage/, ""),
  }),
);

// Mount CORS middleware for all api routes
app.use(
  "/api/*",
  cors({
    origin: env.ALLOWED_ORIGINS.split(","),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

// Mount the main API router under /api
app.route("/api", apiRouter);

// ─── Home route — reads from src/index.html in dev, returns JSON in production ─────
const indexHtml = fs.readFileSync(path.join(__dirname, "index.html"), "utf-8");
app.get("/", (c) => {
  if (!isDev) {
    return c.json({
      name: env.APP_NAME,
      status: "online",
      message: "API service is running.",
    });
  }
  const html = indexHtml
    .replaceAll("{{APP_NAME}}", env.APP_NAME)
    .replaceAll("{{BASE_URL}}", env.BASE_URL);
  return c.html(html);
});

// ─── Favicon — suppress browser 404 warning ───────────────────────────────
app.get("/favicon.ico", (c) => c.body(null, 204));

// ─── Download collection-respon.json (Dev only) ─────────────────────────
app.get("/download/collection", (c) => {
  if (!isDev) {
    return c.json({ error: "Forbidden: Download endpoints are disabled in production." }, 403);
  }
  const filePath = path.resolve("collection-respon.json");
  if (!fs.existsSync(filePath)) {
    return c.json({ error: "Collection file not found. Run: bun run collection" }, 404);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return new Response(content, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${env.APP_NAME.toLowerCase()}-collection.json"`,
    },
  });
});

// ─── Interactive Manual Book Development Reader (Dev only) ──────────────
const manualBookHtmlPath = path.join(__dirname, "manual-book.html");
const manualBookHtml = fs.existsSync(manualBookHtmlPath)
  ? fs.readFileSync(manualBookHtmlPath, "utf-8")
  : "";

app.get("/manual-book", (c) => {
  if (!isDev) {
    return c.json({ error: "Forbidden: Development manual is disabled in production." }, 403);
  }
  const mdPath = path.resolve("manual-book-dev.md");
  if (!fs.existsSync(mdPath)) {
    return c.json({ error: "Manual book file not found." }, 404);
  }
  const rawMd = fs.readFileSync(mdPath, "utf-8");
  const html = manualBookHtml
    .replaceAll("{{APP_NAME}}", env.APP_NAME)
    .replace("{{MANUAL_BOOK_CONTENT}}", rawMd);
  return c.html(html);
});

// ─── Download Raw Manual Book (.md) (Dev only) ───────────────────────────
app.get("/download/manual-book", (c) => {
  if (!isDev) {
    return c.json({ error: "Forbidden: Download endpoints are disabled in production." }, 403);
  }
  const mdPath = path.resolve("manual-book-dev.md");
  if (!fs.existsSync(mdPath)) {
    return c.json({ error: "Manual book file not found." }, 404);
  }
  const content = fs.readFileSync(mdPath, "utf-8");
  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="manual-book-dev.md"',
    },
  });
});

// Global Error Handler
app.onError(errorHandler);

// 404 Not Found Handler
app.notFound((c) => {
  const err = new Error(`Cannot ${c.req.method} ${c.req.path}`);
  (err as any).name = "NotFoundException";
  logger.warning(`Route Not Found: ${c.req.method} ${c.req.path}`, {
    error: err,
    request: { method: c.req.method, path: c.req.path },
    tags: ["404", "route-not-found"],
  });
  return c.json(
    {
      error: "NotFound",
      message: `Cannot ${c.req.method} ${c.req.path}`,
      status: 404,
    },
    404,
  );
});

const port = env.PORT;

// Check if port is in use and kill the process
async function killPortIfInUse(port: number): Promise<void> {
  try {
    const pids = execSync(`lsof -ti:${port}`, { encoding: "utf-8" }).trim();
    if (pids) {
      const pidList = pids.split("\n").filter(Boolean);
      for (const pid of pidList) {
        console.log(`Port ${port} is in use by PID ${pid}. Killing...`);
        try {
          process.kill(Number(pid), "SIGKILL");
        } catch {}
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch {}
}

await killPortIfInUse(port);

const server = Bun.serve({
  fetch: app.fetch,
  port,
});

console.log(`🚀 Server is running on http://localhost:${server.port}`);

// Graceful shutdown — close DB pool and server cleanly
function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.stop(true);
  connectionPool.end().then(() => {
    console.log("Connections closed. Exiting.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
