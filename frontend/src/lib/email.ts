// Server-only helper — calls the FastAPI internal email endpoints, which are
// protected by ADMIN_SECRET (a server-only env var, never exposed to the
// client bundle). Never throws: a failed/skipped email must never block
// signup or the Pro-activation flow.
import { API_URL } from "@/lib/api";

async function triggerInternalEmail(path: string, email: string, name: string): Promise<void> {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[email] ADMIN_SECRET not set — skipping ${path}`);
    }
    return;
  }
  try {
    await fetch(`${API_URL}/api/internal/email/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Secret": secret },
      body: JSON.stringify({ email, name }),
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.error(`[email] ${path} request failed:`, err);
  }
}

export function triggerWelcomeEmail(email: string, name: string): void {
  void triggerInternalEmail("welcome", email, name);
}

export function triggerProActivationEmail(email: string, name: string): void {
  void triggerInternalEmail("pro-activation", email, name);
}
