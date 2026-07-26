/**
 * Mint a compact HS256 JWT that FastAPI verifies with NEXTAUTH_SECRET.
 * next-auth/jwt encode() produces encrypted JWE — incompatible with PyJWT HS256.
 */

import { SignJWT } from "jose";

/** Browser + API session lifetime (30 days). Shared by NextAuth and backendToken. */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export type BackendTokenClaims = {
  id: string;
  email?: string | null;
  isPro?: boolean;
};

/**
 * Returns a compact JWT (3 segments) or null when subject/secret are missing.
 */
export async function mintBackendToken(
  claims: BackendTokenClaims,
): Promise<string | null> {
  const secretRaw = process.env.NEXTAUTH_SECRET;
  if (!secretRaw) return null;

  const subject = String(claims.id ?? "").trim();
  if (!subject) return null;

  const secret = new TextEncoder().encode(secretRaw);
  if (secret.length === 0) return null;

  return new SignJWT({
    id: claims.id,
    email: claims.email ?? undefined,
    isPro: claims.isPro ?? false,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret);
}
