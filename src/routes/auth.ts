import { describeRoute, validator, resolver } from "hono-openapi";
import { Hono } from "hono";
import z from "zod";
import { randomUUID, randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import { user as UserTable, refreshToken as RefreshTokenTable } from "../db/schema/user.js";
import { sosialMedia as SosialMediaTable } from "../db/schema/sosial-media.js";
import { eq, sql } from "drizzle-orm";
import { hashPassword, verifyPassword, upsertCredentialAccount } from "../lib/crypto.js";
import { sign, verify } from "hono/jwt";
import { env } from "../config/drizzle.js";
import { auth } from "../auth.js";
import { downloadAndSaveAvatar } from "../lib/avatar.js";
import { sessionMiddleware, type AuthVariables } from "../middleware/auth.js";

const app = new Hono<{ Variables: AuthVariables }>();

// ─── Token Configuration ─────────────────────────────────────────────────────
// Access token: 15 menit (pendek, untuk aksi API)
// Refresh token: 7 hari (panjang, untuk memperpanjang session)
const ACCESS_TOKEN_SECONDS = 15 * 60;
const REFRESH_TOKEN_DAYS = 7;

function createAccessToken(userId: string, email: string, tokenVersion: number) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { exp: now + ACCESS_TOKEN_SECONDS, sub: userId, email, type: "access", tokenVersion },
    env.JWT_SECRET,
    "HS256",
  );
}

function createRefreshTokenValue() {
  return randomBytes(40).toString("hex");
}

async function storeRefreshToken(userId: string) {
  const token = createRefreshTokenValue();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();

  await db.insert(RefreshTokenTable).values({
    id,
    token,
    userId,
    expiresAt,
    createdAt: now,
  });

  return { token, expiresAt };
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const userResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  image: z.string().nullable(),
  createdFrom: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const registerSchema = z
  .object({
    email: z.string().email().min(1).meta({ examples: ["user@example.com"] }).describe("Email address"),
    password: z.string().min(8).meta({ examples: ["Password123"] }).describe("Password, min 8 characters"),
    confirmPassword: z.string().min(8).meta({ examples: ["Password123"] }).describe("Must match password"),
    name: z.string().optional().meta({ examples: ["Budi"] }).describe("Display name (optional, defaults to email prefix)"),
    image: z.string().optional().meta({ examples: ["https://example.com/avatar.jpg"] }).describe("Avatar URL (optional)"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

const loginSchema = z.object({
  email: z.string().email().min(1).meta({ examples: ["user@example.com"] }).describe("Registered email address"),
  password: z.string().min(6).meta({ examples: ["Password123"] }).describe("Account password"),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1).meta({ examples: ["a1b2c3d4..."] }).describe("Refresh token from login response"),
});

const logoutSchema = z.object({
  refreshToken: z.string().optional().describe("Refresh token to invalidate (optional, invalidates all if omitted)"),
});

// ─── [POST] /register ── Daftarkan user baru ─────────────────────────────────
app.post(
  "/register",
  describeRoute({
    summary: "Register new user",
    description: "Register a user with an email and password",
    responses: {
      201: {
        description: "User registered successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                user: userResponseSchema,
              }),
            ),
          },
        },
      },
      409: {
        description: "Email already in use",
      },
    },
  }),
  validator("json", registerSchema),
  async (c) => {
    const { email, password, name, image } = c.req.valid("json");

    const [existing] = await db
      .select()
      .from(UserTable)
      .where(eq(UserTable.email, email));

    if (existing != null) {
      return c.json({ error: "Email already in use" }, 409);
    }

    const passwordHash = await hashPassword(password);
    const userId = randomUUID();

    let localImagePath: string | null = null;
    if (image && image.startsWith("http")) {
      const downloaded = await downloadAndSaveAvatar(userId, image);
      if (downloaded) {
        localImagePath = downloaded;
      }
    } else if (image) {
      localImagePath = image;
    }

    const userName = name || email.split("@")[0];
    const now = new Date();

    await db.insert(UserTable).values({
      id: userId,
      email,
      name: userName,
      passwordHash,
      createdFrom: "system",
      image: localImagePath,
      createdAt: now,
      updatedAt: now,
    });

    await upsertCredentialAccount(userId, email, passwordHash);

    return c.json(
      {
        user: {
          id: userId,
          name: userName,
          email,
          role: "USER",
          image: localImagePath,
          createdFrom: "system",
          createdAt: now,
          updatedAt: now,
        },
      },
      201,
    );
  },
);

// ─── [POST] /login ── Login user ─────────────────────────────────────────────
// Mengembalikan accessToken (15 menit) + refreshToken (7 hari).
// Gunakan /refresh untuk memperpanjang accessToken tanpa login ulang.
app.post(
  "/login",
  describeRoute({
    summary: "Login user",
    description: "Authenticate email/password. Returns accessToken (15 min) and refreshToken (7 days). Use /refresh to obtain new accessToken.",
    responses: {
      200: {
        description: "Successful login",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                accessToken: z.string().describe("JWT access token, expires in 15 minutes"),
                refreshToken: z.string().describe("Refresh token, expires in 7 days"),
                expiresAt: z.string().describe("Access token expiry (ISO 8601)"),
                user: userResponseSchema,
              }),
            ),
          },
        },
      },
      401: {
        description: "Invalid email or password",
      },
    },
  }),
  validator("json", loginSchema),
  async (c) => {
    const { email, password } = c.req.valid("json");

    const [user] = await db
      .select()
      .from(UserTable)
      .where(eq(UserTable.email, email));

    if (user == null || !user.passwordHash) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const accessToken = await createAccessToken(user.id, user.email, user.tokenVersion ?? 0);
    const { token: refreshToken, expiresAt } = await storeRefreshToken(user.id);

    return c.json({
      accessToken,
      refreshToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        image: user.image,
        createdFrom: user.createdFrom,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  },
);

// ─── [POST] /refresh ── Perpanjang accessToken ────────────────────────────────
// Kirim refreshToken untuk mendapatkan accessToken baru.
// Refresh token di-rotate (lama dihapus, baru dibuat) setiap kali dipakai.
app.post(
  "/refresh",
  describeRoute({
    summary: "Refresh access token",
    description: "Exchange a valid refreshToken for a new accessToken and refreshToken. Old refreshToken is invalidated (rotation).",
    responses: {
      200: {
        description: "Token refreshed successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                accessToken: z.string().describe("New JWT access token"),
                refreshToken: z.string().describe("New refresh token (old one is invalidated)"),
                expiresAt: z.string().describe("New access token expiry (ISO 8601)"),
              }),
            ),
          },
        },
      },
      401: {
        description: "Invalid or expired refresh token",
      },
    },
  }),
  validator("json", refreshTokenSchema),
  async (c) => {
    const { refreshToken: tokenValue } = c.req.valid("json");

    const [stored] = await db
      .select()
      .from(RefreshTokenTable)
      .where(eq(RefreshTokenTable.token, tokenValue));

    if (!stored) {
      return c.json({ error: "Invalid refresh token" }, 401);
    }

    if (new Date() > stored.expiresAt) {
      await db.delete(RefreshTokenTable).where(eq(RefreshTokenTable.id, stored.id));
      return c.json({ error: "Refresh token expired, please login again" }, 401);
    }

    // Delete old refresh token (rotation)
    await db.delete(RefreshTokenTable).where(eq(RefreshTokenTable.id, stored.id));

    // Increment tokenVersion — old access tokens will be rejected
    await db
      .update(UserTable)
      .set({ tokenVersion: sql`token_version + 1` })
      .where(eq(UserTable.id, stored.userId));

    // Get user with updated tokenVersion
    const [user] = await db
      .select()
      .from(UserTable)
      .where(eq(UserTable.id, stored.userId));

    if (!user) {
      return c.json({ error: "User not found" }, 401);
    }

    const accessToken = await createAccessToken(user.id, user.email, user.tokenVersion);
    const { token: newRefreshToken, expiresAt } = await storeRefreshToken(user.id);

    return c.json({
      accessToken,
      refreshToken: newRefreshToken,
      expiresAt: expiresAt.toISOString(),
    });
  },
);

// ─── [POST] /logout ── Logout user ───────────────────────────────────────────
// Invalidate refresh token. Jika tidak ada refreshToken, hapus semua token user.
app.post(
  "/logout",
  describeRoute({
    summary: "Logout user",
    description: "Invalidate refresh token(s). Send refreshToken to invalidate specific token, or omit to invalidate all user tokens.",
    responses: {
      200: {
        description: "Logged out successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                message: z.string(),
                invalidated: z.number().describe("Number of refresh tokens invalidated"),
              }),
            ),
          },
        },
      },
    },
  }),
  validator("json", logoutSchema),
  async (c) => {
    const { refreshToken: tokenValue } = c.req.valid("json");

    let deletedCount = 0;

    if (tokenValue) {
      // Invalidate specific refresh token
      const [stored] = await db
        .select()
        .from(RefreshTokenTable)
        .where(eq(RefreshTokenTable.token, tokenValue));

      if (stored) {
        await db.delete(RefreshTokenTable).where(eq(RefreshTokenTable.id, stored.id));
        // Increment tokenVersion to invalidate old access tokens
        await db
          .update(UserTable)
          .set({ tokenVersion: sql`token_version + 1` })
          .where(eq(UserTable.id, stored.userId));
        deletedCount = 1;
      }
    } else {
      // Try to get userId from Bearer token to invalidate all user tokens
      const authHeader = c.req.header("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const payload = await verify(authHeader.substring(7), env.JWT_SECRET, "HS256");
          const userId = payload.sub as string;
          const tokens = await db
            .select()
            .from(RefreshTokenTable)
            .where(eq(RefreshTokenTable.userId, userId));
          await db.delete(RefreshTokenTable).where(eq(RefreshTokenTable.userId, userId));
          // Increment tokenVersion to invalidate old access tokens
          await db
            .update(UserTable)
            .set({ tokenVersion: sql`token_version + 1` })
            .where(eq(UserTable.id, userId));
          deletedCount = tokens.length;
        } catch {
          // Token invalid, nothing to delete
        }
      }
    }

    return c.json({
      message: "Logged out successfully",
      invalidated: deletedCount,
    });
  },
);

// ─── [POST] /google-mobile ── Login/Register via Google ID Token (Native Mobile) ──
// Endpoint khusus untuk aplikasi native Android/iOS.
// App native mendapatkan Google ID token via Google Credential Manager,
// lalu mengirimkannya ke endpoint ini untuk login/register.
app.post(
  "/google-mobile",
  describeRoute({
    summary: "Google Sign-In for native mobile apps",
    description: "Authenticate using a Google ID token from native Android/iOS app. Creates a new user if not exists, or logs in if exists.",
    responses: {
      200: {
        description: "Authentication successful",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                accessToken: z.string().describe("JWT access token, expires in 15 minutes"),
                refreshToken: z.string().describe("Refresh token, expires in 7 days"),
                expiresAt: z.string().describe("Access token expiry (ISO 8601)"),
                user: userResponseSchema,
              }),
            ),
          },
        },
      },
      401: {
        description: "Invalid Google ID token",
      },
    },
  }),
  validator("json",
    z.object({
      idToken: z.string().min(1).describe("Google ID token from native SDK"),
      password: z.string().min(8).optional().describe("Password for new account registration"),
      confirmPassword: z.string().min(8).optional().describe("Confirm new password, must match password"),
    }),
  ),
  async (c) => {
    const { idToken, password, confirmPassword } = c.req.valid("json");

    // Verifikasi Google ID token
    let googlePayload: { sub: string; email: string; name?: string; picture?: string };
    try {
      const verifyRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
      );
      if (!verifyRes.ok) {
        return c.json({ error: "Invalid or expired Google ID token" }, 401);
      }
      googlePayload = await verifyRes.json() as any;

      if (!googlePayload.email || !googlePayload.sub) {
        return c.json({ error: "Invalid Google ID token payload" }, 401);
      }
    } catch {
      return c.json({ error: "Failed to verify Google ID token" }, 401);
    }

    const { email, name, picture } = googlePayload;

    // Cari user berdasarkan email
    const [existingUser] = await db
      .select()
      .from(UserTable)
      .where(eq(UserTable.email, email));

    let userId: string;
    let userName: string;
    let userRole: string;
    let userImage: string | null = null;
    let passwordHash: string | null = null;

    if (existingUser) {
      // User sudah ada — login
      userId = existingUser.id;
      userName = existingUser.name;
      userRole = existingUser.role;
      userImage = existingUser.image;

      // Update / simpan avatar Google jika belum ada di storage (belum berawalan /storage/)
      if (picture && (!existingUser.image || !existingUser.image.startsWith("/storage/"))) {
        const downloaded = await downloadAndSaveAvatar(userId, picture);
        if (downloaded) {
          userImage = downloaded;
          await db
            .update(UserTable)
            .set({
              image: downloaded,
              updatedAt: new Date(),
            })
            .where(eq(UserTable.id, userId));
        }
      }
    } else {
      // User baru — register via Google
      // Cegat untuk mengatur password
      if (!password || !confirmPassword) {
        return c.json({ error: "Password and confirmPassword are required for registration" }, 400);
      }
      if (password !== confirmPassword) {
        return c.json({ error: "Passwords do not match" }, 400);
      }

      passwordHash = await hashPassword(password);
      userId = randomUUID();
      userName = name || email.split("@")[0];
      userRole = "USER";
      const now = new Date();

      // Download Google avatar jika ada
      let localAvatar: string | null = null;
      if (picture) {
        const downloaded = await downloadAndSaveAvatar(userId, picture);
        if (downloaded) localAvatar = downloaded;
      }
      userImage = localAvatar;

      await db.insert(UserTable).values({
        id: userId,
        email,
        name: userName,
        role: userRole,
        image: localAvatar,
        createdFrom: "google",
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });

      await upsertCredentialAccount(userId, email, passwordHash);
    }

    // Generate tokens
    const accessToken = await createAccessToken(userId, email, existingUser?.tokenVersion ?? 0);
    const { token: refreshToken, expiresAt } = await storeRefreshToken(userId);

    return c.json({
      accessToken,
      refreshToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: userId,
        name: userName,
        email,
        role: userRole,
        image: userImage,
        createdFrom: "google",
        createdAt: existingUser?.createdAt ?? new Date(),
        updatedAt: existingUser?.updatedAt ?? new Date(),
      },
    });
  },
);

// ─── [GET] /me ── Ambil profil user authenticated ───────────────────────────
app.get(
  "/me",
  sessionMiddleware,
  describeRoute({
    summary: "Get authenticated user profile",
    description: "Returns currently authenticated user profile including social media links",
    responses: {
      200: {
        description: "Profile retrieved successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                user: userResponseSchema.extend({
                  sosialMedias: z.array(z.any()).optional(),
                }),
              }),
            ),
          },
        },
      },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const currentUser = c.get("user");
    if (!currentUser) return c.json({ error: "Unauthorized" }, 401);

    const [userWithDetails] = await db
      .select()
      .from(UserTable)
      .where(eq(UserTable.id, currentUser.id));

    if (!userWithDetails) {
      return c.json({ error: "User not found" }, 404);
    }

    const sosialMedias = await db
      .select()
      .from(SosialMediaTable)
      .where(eq(SosialMediaTable.userId, currentUser.id));

    return c.json({
      user: {
        id: userWithDetails.id,
        name: userWithDetails.name,
        email: userWithDetails.email,
        role: userWithDetails.role,
        image: userWithDetails.image,
        createdFrom: userWithDetails.createdFrom,
        createdAt: userWithDetails.createdAt,
        updatedAt: userWithDetails.updatedAt,
        sosialMedias,
      },
    });
  },
);

// ─── [PUT] /update-profile ── Update nama dan/atau foto profil ─────────────
const updateProfileSchema = z.object({
  name: z.string().min(1).optional().describe("Updated display name"),
  image: z.string().optional().describe("Updated avatar URL or local storage path"),
});

app.put(
  "/update-profile",
  sessionMiddleware,
  describeRoute({
    summary: "Update user profile",
    description: "Update display name and/or avatar image for authenticated user",
    responses: {
      200: {
        description: "Profile updated successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                message: z.string(),
                user: userResponseSchema,
              }),
            ),
          },
        },
      },
      400: { description: "Bad request" },
      401: { description: "Unauthorized" },
    },
  }),
  validator("json", updateProfileSchema),
  async (c) => {
    const currentUser = c.get("user");
    if (!currentUser) return c.json({ error: "Unauthorized" }, 401);

    const { name, image } = c.req.valid("json");
    if (!name && image === undefined) {
      return c.json({ error: "No fields provided to update" }, 400);
    }

    let localImagePath: string | undefined = undefined;
    if (image && image.startsWith("http")) {
      const downloaded = await downloadAndSaveAvatar(currentUser.id, image);
      if (downloaded) localImagePath = downloaded;
    } else if (image !== undefined) {
      localImagePath = image;
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (localImagePath !== undefined) updateData.image = localImagePath;

    await db
      .update(UserTable)
      .set(updateData)
      .where(eq(UserTable.id, currentUser.id));

    const [updatedUser] = await db
      .select()
      .from(UserTable)
      .where(eq(UserTable.id, currentUser.id));

    return c.json({
      message: "Profile updated successfully",
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        image: updatedUser.image,
        createdFrom: updatedUser.createdFrom,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    });
  },
);

// ─── [PUT] /update-password ── Update password (wajib password lama) ──────
const updatePasswordSchema = z
  .object({
    oldPassword: z.string().min(1).meta({ examples: ["Password123"] }).describe("Current account password (required)"),
    newPassword: z.string().min(8).meta({ examples: ["NewPassword123"] }).describe("New password, min 8 characters"),
    confirmNewPassword: z.string().min(8).meta({ examples: ["NewPassword123"] }).describe("Confirm new password, must match newPassword"),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "New passwords don't match",
    path: ["confirmNewPassword"],
  });

app.put(
  "/update-password",
  sessionMiddleware,
  describeRoute({
    summary: "Update account password",
    description: "Change password for authenticated user. Requires valid old password.",
    responses: {
      200: {
        description: "Password updated successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                message: z.string(),
              }),
            ),
          },
        },
      },
      400: { description: "Invalid request or incorrect old password" },
      401: { description: "Unauthorized" },
    },
  }),
  validator("json", updatePasswordSchema),
  async (c) => {
    const currentUser = c.get("user");
    if (!currentUser) return c.json({ error: "Unauthorized" }, 401);

    const { oldPassword, newPassword } = c.req.valid("json");

    const [dbUser] = await db
      .select()
      .from(UserTable)
      .where(eq(UserTable.id, currentUser.id));

    if (!dbUser || !dbUser.passwordHash) {
      return c.json({ error: "User password account not found" }, 400);
    }

    // Verify old password
    const isOldPasswordValid = await verifyPassword(oldPassword, dbUser.passwordHash);
    if (!isOldPasswordValid) {
      return c.json({ error: "Incorrect old password" }, 400);
    }

    const newPasswordHash = await hashPassword(newPassword);

    await db
      .update(UserTable)
      .set({
        passwordHash: newPasswordHash,
        tokenVersion: sql`token_version + 1`,
        updatedAt: new Date(),
      })
      .where(eq(UserTable.id, currentUser.id));

    await upsertCredentialAccount(currentUser.id, dbUser.email, newPasswordHash);

    return c.json({
      message: "Password updated successfully. Please login again with your new password.",
    });
  },
);

// ─── Catch-all ── Forward ke Better Auth ─────────────────────────────────────
// Semua request auth lain (Google OAuth, get-session, dll.) diteruskan ke Better Auth.
app.on(["POST", "GET"], "/*", async (c) => {
  const res = await auth.handler(c.req.raw);

  const headers = new Headers(res.headers);
  c.res.headers.forEach((value, key) => {
    headers.set(key, value);
  });

  return new Response(res.body, {
    status: res.status,
    headers,
  });
});

export default app;
