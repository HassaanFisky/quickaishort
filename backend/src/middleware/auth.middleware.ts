import { Request, Response, NextFunction } from "express";
import { getSupabaseAdmin } from "../config/supabase.js";
import { getDb } from "../config/neon.js";
import { users } from "../models/schema.js";
import { eq } from "drizzle-orm";

export interface AuthenticatedRequest extends Request {
  userId: string;
  dbUserId: string;
  userEmail: string;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const supabase = getSupabaseAdmin();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const db = getDb();

    let dbUser = await db.query.users.findFirst({
      where: eq(users.supabaseUserId, user.id),
    });

    if (!dbUser) {
      const [newUser] = await db
        .insert(users)
        .values({
          supabaseUserId: user.id,
          email: user.email ?? "unknown@example.com",
          name:
            user.user_metadata?.full_name ??
            user.email?.split("@")[0] ??
            "User",
          avatarUrl: user.user_metadata?.avatar_url ?? null,
          subscriptionTier: "free",
          quotaUsed: 0,
        })
        .returning();
      dbUser = newUser;
    }

    const authReq = req as AuthenticatedRequest;
    authReq.userId = user.id;
    authReq.dbUserId = dbUser.id;
    authReq.userEmail = dbUser.email;

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    res.status(500).json({ error: "Authentication service unavailable" });
  }
}
