/**
 * Public-facing mailbox — safe for client + server components.
 *
 * Production rule: one verified ImprovMX channel only —
 * contact@quickaishort.online (SUPPORT / FEEDBACK / GENERAL / REPLY-TO aliases).
 */

export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ||
  process.env.NEXT_PUBLIC_GENERAL_EMAIL?.trim() ||
  process.env.NEXT_PUBLIC_FEEDBACK_EMAIL?.trim() ||
  "contact@quickaishort.online";

/** @deprecated Use CONTACT_EMAIL — kept for call-site compatibility. */
export const SUPPORT_EMAIL = CONTACT_EMAIL;
/** @deprecated Use CONTACT_EMAIL — kept for call-site compatibility. */
export const FEEDBACK_EMAIL = CONTACT_EMAIL;
/** @deprecated Use CONTACT_EMAIL — kept for call-site compatibility. */
export const GENERAL_EMAIL = CONTACT_EMAIL;

export function mailto(email: string): string {
  return `mailto:${email}`;
}
