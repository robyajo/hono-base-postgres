import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config/drizzle.js";
import * as schemaFiles from "./schema/index.js";
import * as relationsFiles from "./relations.js";

export const schema = { ...schemaFiles, ...relationsFiles };

export const connectionPool = postgres({
  host: config.DB_HOST,
  port: Number(config.DB_PORT),
  user: config.DB_USER,
  username: config.DB_USER,
  password: config.DB_PASSWORD,
  pass: config.DB_PASSWORD,
  database: config.DB_NAME,
  db: config.DB_NAME,
  ssl: false,
});

export const db = drizzle(connectionPool as any, { schema } as any);