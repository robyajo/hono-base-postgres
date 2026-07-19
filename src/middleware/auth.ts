import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import { user as UserTable } from "../db/schema/user.js";
import { eq } from "drizzle-orm";
import { config } from "../config/drizzle.js";

export type AuthVariables = {
    user: {
        id: string;
        name: string;
        email: string;
        role: string;
        image?: string | null;
        emailVerified: boolean;
        createdAt: Date;
        updatedAt: Date;
    };
    session?: typeof auth.$Infer.Session.session;
};

export const sessionMiddleware = createMiddleware<{
    Variables: AuthVariables;
}>(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    
    // 1. Try JWT validation if header starts with Bearer
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
            const payload = await verify(token, config.JWT_SECRET, "HS256");
            const userId = payload.sub as string;
            const tokenVersion = payload.tokenVersion as number | undefined;
            
            const [dbUser] = await db
                .select()
                .from(UserTable)
                .where(eq(UserTable.id, userId));
                
            if (dbUser) {
                // Reject if token version doesn't match (token was invalidated by refresh/logout)
                if (tokenVersion !== undefined && tokenVersion !== dbUser.tokenVersion) {
                    return c.json({ error: "Token invalidated, please refresh" }, 401);
                }
                
                c.set("user", {
                    id: dbUser.id,
                    name: dbUser.name || "User",
                    email: dbUser.email,
                    role: dbUser.role,
                    image: dbUser.image,
                    emailVerified: dbUser.emailVerified,
                    createdAt: dbUser.createdAt,
                    updatedAt: dbUser.updatedAt,
                });
                return await next();
            }
        } catch (err) {
            // Ignore error and fall through to Better Auth
        }
    }

    // 2. Try Better Auth session validation
    const session = await auth.api.getSession({
        headers: c.req.raw.headers,
    });

    if (!session) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("user", session.user as any);
    c.set("session", session.session);
    await next();
});

export const adminMiddleware = createMiddleware<{
    Variables: AuthVariables;
}>(async (c, next) => {
    const user = c.get("user");

    if (!user || user.role !== "ADMIN") {
        return c.json({ error: "Forbidden: Admin role required" }, 403);
    }

    await next();
});