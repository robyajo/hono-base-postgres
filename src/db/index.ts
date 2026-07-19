import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config/drizzle.js";
import * as schema from "./schema/index.js";

export const connectionPool = postgres({
    host: config.DB_HOST || "127.0.0.1",
    port: config.DB_PORT ? Number(config.DB_PORT) : 5432,
    user: config.DB_USER || "postgres",
    password: config.DB_PASSWORD || "",
    database: config.DB_NAME || "hono_base",
});

export const db = drizzle(connectionPool as any, { schema } as any);