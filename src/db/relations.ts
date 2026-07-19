import { defineRelations } from "drizzle-orm";
import * as schema from "./schema/index.js";

export const relations = defineRelations(schema, (r) => ({
  user: {
    sessions: r.many.session(),
    accounts: r.many.account(),
    refreshTokens: r.many.refreshToken(),
    sosialMedias: r.many.sosialMedia(),
  },
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
  refreshToken: {
    user: r.one.user({
      from: r.refreshToken.userId,
      to: r.user.id,
    }),
  },
  sosialMedia: {
    user: r.one.user({
      from: r.sosialMedia.userId,
      to: r.user.id,
    }),
  },
}));
