import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { config } from "./src/config/drizzle";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/drizzle",
  dbCredentials: {
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    user: config.DB_USER,
    host: config.DB_HOST,
    port: config.DB_PORT,
  },
});
