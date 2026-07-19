import { createMiddleware } from "hono/factory";
import { sessionMiddleware } from "./auth";
import type { AuthVariables } from "./auth";

export const ensureUser = createMiddleware<{
    Variables: AuthVariables;
}>(async (c, next) => {
    // If sessionMiddleware has not run, execute it inline to authenticate the request
    if (!c.get("user")) {
        let authenticated = false;
        await sessionMiddleware(c, async () => {
            authenticated = true;
        });
        if (!authenticated) return; // sessionMiddleware already handled unauthorized response
    }

    const user = c.get("user");
    if (!user || user.role !== "USER") {
        return c.json({ error: "Forbidden: User role required" }, 403);
    }

    await next();
});
