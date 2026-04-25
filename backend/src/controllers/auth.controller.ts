import { Response } from "express";
import { getSupabaseAdmin } from "../config/supabase.js";
import { getDb } from "../config/neon.js";
import { users } from "../models/schema.js";
import { eq } from "drizzle-orm";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

export async function handleAuthCallback(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const db = getDb();

    const existingUser = await db.query.users.findFirst({
      where: eq(users.supabaseUserId, req.userId),
    });

    if (existingUser) {
      res.status(200).json({
        message: "User authenticated successfully",
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          subscriptionTier: existingUser.subscriptionTier,
          quotaUsed: existingUser.quotaUsed,
          createdAt: existingUser.createdAt,
        },
      });
      return;
    }

    const supabase = getSupabaseAdmin();
    const {
      data: { user: supabaseUser },
    } = await supabase.auth.admin.getUserById(req.userId);

    if (!supabaseUser) {
      res.status(404).json({ error: "Supabase user not found" });
      return;
    }

    const [newUser] = await db
      .insert(users)
      .values({
        supabaseUserId: supabaseUser.id,
        email: supabaseUser.email ?? "unknown@example.com",
        name:
          supabaseUser.user_metadata?.full_name ??
          supabaseUser.email?.split("@")[0] ??
          "User",
        avatarUrl: supabaseUser.user_metadata?.avatar_url ?? null,
        subscriptionTier: "free",
        quotaUsed: 0,
      })
      .returning();

    res.status(201).json({
      message: "User created and authenticated",
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        subscriptionTier: newUser.subscriptionTier,
        quotaUsed: newUser.quotaUsed,
        createdAt: newUser.createdAt,
      },
    });
  } catch (err) {
    console.error("Auth callback error:", err);
    res.status(500).json({ error: "Failed to process authentication" });
  }
}

export async function getCurrentUser(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const db = getDb();

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.dbUserId),
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(200).json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      subscriptionTier: user.subscriptionTier,
      quotaUsed: user.quotaUsed,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error("Get current user error:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
}
