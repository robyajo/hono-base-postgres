import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./user.js";

export const sosialMedia = pgTable("sosial_media", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  url: text("url").notNull(),
  username: text("username"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
