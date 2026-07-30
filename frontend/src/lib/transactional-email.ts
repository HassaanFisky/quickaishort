/**
 * Outbound transactional email — ImprovMX primary, Resend fallback.
 *
 * ImprovMX free plan = inbound forwarding only (send_ready=false, daily_send=0).
 * Until Premium/Light is purchased, Resend carries password-reset / transactional
 * sends when RESEND_API_KEY is set. From-address stays noreply@quickaishort.online
 * when Resend domain is verified; otherwise Resend rejects and we surface the error.
 */

import { sendImprovMXEmail } from "@/lib/improvmx";

export type TransactionalEmailParams = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
};

export type TransactionalEmailResult =
  | { ok: true; provider: "improvmx" | "resend"; id?: string }
  | { ok: false; error: string; providerAttempts: string[] };

function isImprovMXUnavailable(error: string): boolean {
  const e = error.toLowerCase();
  return (
    e.includes("premium") ||
    e.includes("forbidden") ||
    e.includes("not found") ||
    e.includes("404") ||
    e.includes("403") ||
    e.includes("send_ready") ||
    e.includes("not configured for sending")
  );
}

async function sendViaResend(
  params: TransactionalEmailParams
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "skipped_no_resend_key" };
  }

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    `${process.env.IMPROVMX_FROM_ALIAS?.trim() || "noreply"}@${
      process.env.IMPROVMX_DOMAIN?.trim() || "quickaishort.online"
    }`;

  const replyTo =
    process.env.IMPROVMX_REPLY_TO?.trim() ||
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ||
    "contact@quickaishort.online";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        reply_to: replyTo,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: body.message || body.name || response.statusText || "resend_failed",
      };
    }

    return { ok: true, id: body.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendTransactionalEmail(
  params: TransactionalEmailParams
): Promise<TransactionalEmailResult> {
  const attempts: string[] = [];

  const improvmx = await sendImprovMXEmail(params);
  if (improvmx.ok) {
    return { ok: true, provider: "improvmx", id: improvmx.id };
  }
  attempts.push(`improvmx:${improvmx.error}`);

  if (!isImprovMXUnavailable(improvmx.error) && process.env.RESEND_API_KEY?.trim()) {
    // Unexpected ImprovMX error but still try fallback for reliability
  }

  if (process.env.RESEND_API_KEY?.trim()) {
    const resend = await sendViaResend(params);
    if (resend.ok) {
      console.info(
        "[email] ImprovMX send unavailable — delivered via Resend fallback"
      );
      return { ok: true, provider: "resend", id: resend.id };
    }
    attempts.push(`resend:${resend.error}`);
  } else if (isImprovMXUnavailable(improvmx.error)) {
    attempts.push(
      "hint:ImprovMX free plan cannot send. Set RESEND_API_KEY or upgrade ImprovMX Light/Premium."
    );
  }

  return { ok: false, error: attempts.join(" | "), providerAttempts: attempts };
}
