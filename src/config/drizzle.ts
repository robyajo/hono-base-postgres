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
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().default("http://localhost:3000"),
  BETTER_AUTH_COOKIE_DOMAIN: z.string().default("localhost"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = parsed.data;
export const env = parsed.data;

