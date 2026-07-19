import { db } from "../db/index.js";
import { account } from "../db/schema/user.js";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  if (typeof Bun !== "undefined" && Bun.password) {
    return await Bun.password.hash(password);
  }
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (typeof Bun !== "undefined" && Bun.password) {
    return await Bun.password.verify(password, hash);
  }
  return await bcrypt.compare(password, hash);
}

export async function upsertCredentialAccount(userId: string, email: string, passwordHash: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));

  const now = new Date();
  if (existing) {
    await db
      .update(account)
      .set({
        password: passwordHash,
        updatedAt: now,
      })
      .where(eq(account.id, existing.id));
  } else {
    await db.insert(account).values({
      id: randomUUID(),
      userId,
      accountId: email,
      providerId: "credential",
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  }
}
