import "dotenv/config";
import z from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8000),
  BASE_URL: z.string().default("http://localhost:8000"),
  APP_NAME: z.string().default("Hono Base Postgres"),
  JWT_SECRET: z.string().default("super-secret-jwt-key-change-me"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  DB_USER: z.string().default("postgres"),
  DB_PASSWORD: z.string().default("12341234"),
  DB_NAME: z.string().default("hono_base"),
  DB_HOST: z.string().default("127.0.0.1"),
  DB_PORT: z.coerce.number().default(5432),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  NODE_ENV: z.string().default("development"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().default("http://localhost:3000"),
  BETTER_AUTH_COOKIE_DOMAIN: z.string().default("localhost"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Optional Redis Configuration (BullMQ / Queue)
  REDIS_ENABLED: z.coerce.boolean().default(false),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  // Optional WebSocket Configuration (Hono + Bun WS)
  WS_ENABLED: z.coerce.boolean().default(false),
  WS_PATH: z.string().default("/ws"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

// Explicitly sync Postgres env vars to override OS defaults (e.g. Windows PGUSER)
process.env.PGUSER = parsed.data.DB_USER;
process.env.PGPASSWORD = parsed.data.DB_PASSWORD;
process.env.PGHOST = parsed.data.DB_HOST;
process.env.PGPORT = String(parsed.data.DB_PORT);
process.env.PGDATABASE = parsed.data.DB_NAME;

export const config = parsed.data;
export const env = parsed.data;
export const isProduction = parsed.data.APP_ENV === "production" || process.env.NODE_ENV === "production";
export const isDev = !isProduction;


