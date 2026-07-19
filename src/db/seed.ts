import "dotenv/config";
import { db } from "./index.js";
import { user as UserTable } from "./schema/user.js";
import { sosialMedia as SosialMediaTable } from "./schema/sosial-media.js";
import { hashPassword, upsertCredentialAccount } from "../lib/crypto.js";
import { eq } from "drizzle-orm";
import { auth } from "../auth.js";
import { randomUUID } from "node:crypto";

export async function seed() {
  console.log("🌱 Starting database user & social media seeding...");

  try {
    const adminEmail = "admin@gmail.com";
    const userEmail = "user@gmail.com";
    const defaultPassword = "Password123";

    // 1. Clean up existing seed users to prevent duplicate conflicts
    console.log("🧹 Cleaning up existing seed users...");
    await db.delete(UserTable).where(eq(UserTable.email, adminEmail));
    await db.delete(UserTable).where(eq(UserTable.email, userEmail));

    const passwordHash = await hashPassword(defaultPassword);

    // 2. Seed Admin User & Social Media
    console.log("👤 Registering admin account...");
    const adminResult = await auth.api.signUpEmail({
      body: {
        email: adminEmail,
        password: defaultPassword,
        name: "Admin",
      },
    });

    if (adminResult && adminResult.user) {
      const adminId = adminResult.user.id;
      await db
        .update(UserTable)
        .set({
          role: "ADMIN",
          createdFrom: "system",
          type: "internal",
          passwordHash: passwordHash,
          image: "https://api.dicebear.com/7.x/adventurer/svg?seed=Admin",
          emailVerified: true,
        })
        .where(eq(UserTable.id, adminId));

      await upsertCredentialAccount(adminId, adminEmail, passwordHash);

      console.log("📱 Seeding social media profiles for Admin...");
      await db.insert(SosialMediaTable).values([
        {
          id: randomUUID(),
          userId: adminId,
          platform: "github",
          url: "https://github.com/admin-dev",
          username: "@admin-dev",
        },
        {
          id: randomUUID(),
          userId: adminId,
          platform: "linkedin",
          url: "https://linkedin.com/in/admin-dev",
          username: "Admin Developer",
        },
        {
          id: randomUUID(),
          userId: adminId,
          platform: "instagram",
          url: "https://instagram.com/admin_dev",
          username: "@admin_dev",
        },
      ]);
    }

    // 3. Seed Standard User & Social Media
    console.log("👤 Registering standard user account...");
    const userResult = await auth.api.signUpEmail({
      body: {
        email: userEmail,
        password: defaultPassword,
        name: "User",
      },
    });

    if (userResult && userResult.user) {
      const userId = userResult.user.id;
      await db
        .update(UserTable)
        .set({
          role: "USER",
          createdFrom: "system",
          type: "internal",
          passwordHash: passwordHash,
          image: "https://api.dicebear.com/7.x/adventurer/svg?seed=User",
          emailVerified: true,
        })
        .where(eq(UserTable.id, userId));

      await upsertCredentialAccount(userId, userEmail, passwordHash);

      console.log("📱 Seeding social media profiles for Standard User...");
      await db.insert(SosialMediaTable).values([
        {
          id: randomUUID(),
          userId,
          platform: "instagram",
          url: "https://instagram.com/user_profile",
          username: "@user_profile",
        },
        {
          id: randomUUID(),
          userId,
          platform: "tiktok",
          url: "https://tiktok.com/@user_profile",
          username: "@user_profile",
        },
      ]);
    }

    console.log("✨ Seeding completed successfully!");
    console.log(`\n🔑 Created Accounts:`);
    console.log(`   👑 Admin Account:`);
    console.log(`      📧 Email: ${adminEmail}`);
    console.log(`      🔑 Password: ${defaultPassword}`);
    console.log(`      📱 Social Media: GitHub, LinkedIn, Instagram`);
    console.log(`   👤 User Account:`);
    console.log(`      📧 Email: ${userEmail}`);
    console.log(`      🔑 Password: ${defaultPassword}`);
    console.log(`      📱 Social Media: Instagram, TikTok\n`);

  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"))
) {
  seed().then(() => process.exit(0));
}
