import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/bun";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import apiRouter from "./routes/index.js";
import type { AuthVariables } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { logger, registerProcessErrorHandlers } from "./lib/logger.js";
import { env, isDev } from "./config/drizzle.js";
import { connectionPool } from "./db/index.js";
import { checkPortOccupied } from "./lib/port.js";
import { ensureStorageDirs, setupGracefulShutdown } from "./lib/server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── System Initializations ──────────────────────────────────────────────────
registerProcessErrorHandlers();
ensureStorageDirs();

const app = new Hono<{ Variables: AuthVariables }>();

// ─── Global Middleware ───────────────────────────────────────────────────────
app.use(secureHeaders());
app.use(requestLogger);

// Serve public storage assets statically under /storage/*
app.use(
  "/storage/*",
  cors({ origin: env.ALLOWED_ORIGINS.split(","), credentials: true }),
  serveStatic({
    root: "./src/storage/app/public",
    rewriteRequestPath: (p) => p.replace(/^\/storage/, ""),
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

// ─── API Routes Mount ────────────────────────────────────────────────────────
app.route("/api", apiRouter);

// ─── Home & Static UI Routes ─────────────────────────────────────────────────
const indexHtmlPath = path.join(__dirname, "html", "index.html");
const indexHtml = fs.existsSync(indexHtmlPath) ? fs.readFileSync(indexHtmlPath, "utf-8") : "";

app.get("/", (c) => {
  if (!isDev) {
    return c.json({ name: env.APP_NAME, status: "online", message: "API service is running." });
  }
  const html = indexHtml.replaceAll("{{APP_NAME}}", env.APP_NAME).replaceAll("{{BASE_URL}}", env.BASE_URL);
  return c.html(html);
});

app.get("/favicon.ico", (c) => c.body(null, 204));

// ─── Dev Only Tools & Documentation Routes ──────────────────────────────────
app.get("/download/collection", (c) => {
  if (!isDev) return c.json({ error: "Forbidden: Download endpoints are disabled in production." }, 403);
  const filePath = path.resolve("collection-respon.json");
  if (!fs.existsSync(filePath)) return c.json({ error: "Collection file not found. Run: bun run collection" }, 404);
  return new Response(fs.readFileSync(filePath, "utf-8"), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${env.APP_NAME.toLowerCase()}-collection.json"`,
    },
  });
});

const manualBookHtmlPath = path.join(__dirname, "html", "manual-book.html");
const manualBookHtml = fs.existsSync(manualBookHtmlPath) ? fs.readFileSync(manualBookHtmlPath, "utf-8") : "";

app.get("/manual-book", (c) => {
  if (!isDev) return c.json({ error: "Forbidden: Development manual is disabled in production." }, 403);
  const mdPath = path.resolve("manual-book-dev.md");
  if (!fs.existsSync(mdPath)) return c.json({ error: "Manual book file not found." }, 404);
  const rawMd = fs.readFileSync(mdPath, "utf-8");
  const html = manualBookHtml.replaceAll("{{APP_NAME}}", env.APP_NAME).replace("{{MANUAL_BOOK_CONTENT}}", rawMd);
  return c.html(html);
});

app.get("/download/manual-book", (c) => {
  if (!isDev) return c.json({ error: "Forbidden: Download endpoints are disabled in production." }, 403);
  const mdPath = path.resolve("manual-book-dev.md");
  if (!fs.existsSync(mdPath)) return c.json({ error: "Manual book file not found." }, 404);
  return new Response(fs.readFileSync(mdPath, "utf-8"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="manual-book-dev.md"',
    },
  });
});

// ─── Error Handlers ──────────────────────────────────────────────────────────
app.onError(errorHandler);

app.notFound((c) => {
  const err = new Error(`Cannot ${c.req.method} ${c.req.path}`);
  (err as any).name = "NotFoundException";
  logger.warning(`Route Not Found: ${c.req.method} ${c.req.path}`, {
    error: err,
    request: { method: c.req.method, path: c.req.path },
    tags: ["404", "route-not-found"],
  });
  return c.json({ error: "NotFound", message: `Cannot ${c.req.method} ${c.req.path}`, status: 404 }, 404);
});

// ─── Server Startup & Lifecycle ──────────────────────────────────────────────
const port = env.PORT;
checkPortOccupied(port);

const server = Bun.serve({ fetch: app.fetch, port });
console.log(`🚀 Server is running on http://localhost:${server.port}`);

setupGracefulShutdown(server, connectionPool);

export default app;
