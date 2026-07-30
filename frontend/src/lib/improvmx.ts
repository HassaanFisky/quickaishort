/**
 * Server-only ImprovMX outbound email client (Next.js API routes).
 * Never import from client components — use IMPROVMX_API_KEY server-side only.
 */

const API_BASE = "https://api.improvmx.com/v3";
const DEFAULT_DOMAIN = "quickaishort.online";

export type ImprovMXSendParams = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  fromAlias?: string;
  replyTo?: string;
};

export type ImprovMXSendResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

export async function sendImprovMXEmail(
  params: ImprovMXSendParams
): Promise<ImprovMXSendResult> {
  const apiKey = process.env.IMPROVMX_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "skipped_no_api_key" };
  }

  if (!params.html && !params.text) {
    return { ok: false, error: "html_or_text_required" };
  }

  const domain = process.env.IMPROVMX_DOMAIN?.trim() || DEFAULT_DOMAIN;
  const fromAlias =
    params.fromAlias?.trim() ||
    process.env.IMPROVMX_FROM_ALIAS?.trim() ||
    "noreply";
  const replyTo =
    params.replyTo?.trim() ||
    process.env.IMPROVMX_REPLY_TO?.trim() ||
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ||
    "contact@quickaishort.online";

  const payload: Record<string, unknown> = {
    from: fromAlias,
    to: params.to,
    subject: params.subject,
    reply_to: replyTo,
  };
  if (params.html) payload.html = params.html;
  if (params.text) payload.text = params.text;

  const auth = Buffer.from(`api:${apiKey}`).toString("base64");

  try {
    const response = await fetch(
      `${API_BASE}/domains/${encodeURIComponent(domain)}/emails/outbound`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const body = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      id?: string;
      errors?: unknown;
      error?: string;
    };

    if (!response.ok || body.success === false) {
      const detail =
        body.errors != null
          ? JSON.stringify(body.errors)
          : body.error || response.statusText;
      return { ok: false, error: String(detail) };
    }

    return { ok: true, id: body.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
