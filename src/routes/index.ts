import { Hono } from "hono";
import authRoute from "./auth.js";
import { sessionMiddleware } from "../middleware/auth.js";
import { ensureAdmin } from "../middleware/ensureAdmin.js";
import type { AuthVariables } from "../middleware/auth.js";
import { openAPIRouteHandler, describeRoute, resolver } from "hono-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import z from "zod";
import { env } from "../config/drizzle.js";

const api = new Hono<{
  Variables: AuthVariables;
}>();

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-ROUTER MOUNTS — Setiap fitur di-mount ke prefix masing-masing
// ═══════════════════════════════════════════════════════════════════════════════
api.route("/auth", authRoute); // Auth (register, login, Better Auth)

// ─── [GET] /openapi ── Generate spesifikasi OpenAPI ──────────────────────────
// Menghasilkan dokumentasi OpenAPI JSON dari semua route yang terdaftar.
api.get(
  "/openapi",
  openAPIRouteHandler(api, {
    documentation: {
      info: {
        title: env.APP_NAME,
        version: "1.0.0",
        description: `${env.APP_NAME} API with Better Auth, Drizzle PostgreSQL, Bun runtime, Zod validation and Swagger UI documentation`,
      },
      servers: [
        {
          url: `${env.BASE_URL}/api`,
          description: "Development Server",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Paste your JWT token from /auth/login response",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  }),
);

// ─── [GET] /doc ── Dashboard Swagger UI ───────────────────────────────────────
// Tampilan visual dokumentasi API berdasarkan OpenAPI spec.
api.get("/doc", swaggerUI({ url: "/api/openapi" }));

const healthSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
  database: z.string(),
});

// ─── [GET] /health ── Cek kesehatan API & database ──────────────────────────
// Mengecek koneksi database dengan query SELECT 1.
api.get(
  "/health",
  describeRoute({
    summary: "Database health check",
    description: "Checks if the API and database connections are healthy.",
    responses: {
      200: {
        description: "API and Database are healthy",
        content: {
          "application/json": {
            schema: resolver(healthSchema),
          },
        },
      },
      503: {
        description: "Database connection failed",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                status: z.string(),
                timestamp: z.string(),
                database: z.string(),
                error: z.string(),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
      return c.json(
        {
          status: "healthy",
          timestamp: new Date().toISOString(),
          database: "connected",
        },
        200,
      );
    } catch (error) {
      return c.json(
        {
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          database: "disconnected",
          error: error instanceof Error ? error.message : "Unknown error",
        },
        503,
      );
    }
  },
);

// ─── [GET] /public ── Endpoint publik (tanpa auth) ───────────────────────────
// Bisa diakses siapa saja tanpa login — untuk testing.
api.get("/public", (c) => {
  return c.json({
    message: "Welcome to the public API endpoint!",
    timestamp: new Date(),
  });
});

// ─── [GET] /protected ── Endpoint untuk user yang sudah login ────────────────
// Contoh route yang membutuhkan session aktif.
api.get("/protected", sessionMiddleware, (c) => {
  const user = c.get("user");
  return c.json({
    message: `Hello ${user.name}, you are authenticated!`,
    user,
  });
});

// ─── [GET] /admin ── Endpoint khusus Admin ────────────────────────────────────
// Contoh route yang hanya bisa diakses oleh user dengan role ADMIN.
api.get("/admin", ensureAdmin, (c) => {
  const user = c.get("user");
  return c.json({
    message: `Welcome, Admin ${user.name}! This is a highly protected resource.`,
    user,
  });
});

export default api;
