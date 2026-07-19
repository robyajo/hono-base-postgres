import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./index.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { seed } from "./seed.js";
import fs from "node:fs";

async function reset() {
  console.log("🔄 Resetting PostgreSQL database...");

  try {
    // Drop drizzle schema tracking table AND public schema so migrations re-apply cleanly
    console.log("🗑️ Dropping public and drizzle schemas...");
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE;`);
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE;`);
    await db.execute(sql`CREATE SCHEMA public;`);
    await db.execute(sql`GRANT ALL ON SCHEMA public TO public;`);
    console.log("✅ Database schema reset successfully!");

    // Run migrations if migrations folder exists
    if (fs.existsSync("./src/db/drizzle")) {
      console.log("🔄 Running migrations...");
      await migrate(db, { migrationsFolder: "./src/db/drizzle" });
      console.log("✅ Migrations completed successfully!");
    } else {
      console.log("ℹ️ No migrations folder found, skipping migration step.");
    }

    // Check if --seed argument is passed
    const shouldSeed = process.argv.includes("--seed");
    if (shouldSeed) {
      console.log("🌱 --seed flag detected. Starting seeding...");
      await seed();
    }
  } catch (error) {
    console.error("❌ Reset failed:", error);
    process.exit(1);
  }
}

reset().then(() => process.exit(0));
