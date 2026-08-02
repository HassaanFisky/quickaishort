// Maps NextAuth error codes and raw API messages to clean, user-facing strings.
// Pattern: what failed → is work safe → next action.

const AUTH_ERROR_MAP: Record<string, string> = {
  "Invalid email or password": "Incorrect email or password. Please try again.",
  "Missing email or password": "Please enter your email and password.",
  CredentialsSignin: "Incorrect email or password. Please try again.",
  OAuthSignin: "Could not start sign-in. Please try again.",
  OAuthCallback: "Sign-in was interrupted. Please try again.",
  OAuthCreateAccount: "Could not create account. Please try again.",
  EmailCreateAccount: "Could not create account. Please try again.",
  Callback: "Sign-in callback failed. Please try again.",
  OAuthAccountNotLinked:
    "An account with this email already exists. Please sign in with the original method.",
  SessionRequired: "Please sign in to continue.",
  Default: "Sign-in failed. Please try again.",
};

const SAFE_API_PREFIXES = [
  "Please fill all fields",
  "User already exists",
  "Password must be",
  "Email already",
  "Account created",
  "Unsupported",
  "File too large",
  "Invalid URL",
  "Out of credits",
  "You're out of credits",
];

export function mapAuthError(error: string | undefined | null): string {
  if (!error) return "";
  return AUTH_ERROR_MAP[error] ?? AUTH_ERROR_MAP.Default;
}

export function mapApiError(message: string | undefined | null, context?: string): string {
  if (!message) {
    return context
      ? `${context} failed. Your work is safe — try again in a moment.`
      : "That request failed. Your work is safe — try again in a moment.";
  }
  if (SAFE_API_PREFIXES.some((prefix) => message.startsWith(prefix))) return message;
  return context
    ? `${context} failed. Your work is safe — try again or refresh the page.`
    : "That request failed. Your work is safe — try again or refresh the page.";
}

export function mapUploadError(code?: string): string {
  switch (code) {
    case "unsupported_format":
      return "This file format isn't supported. Upload MP4, MOV, or WebM instead.";
    case "too_large":
      return "This file exceeds the size limit. Trim the clip or compress it, then retry.";
    case "invalid_url":
      return "That link isn't valid. Paste a full YouTube or direct video URL.";
    case "meta_fetch_failed":
      return "We couldn't read that video. Check the link is public and try again.";
    case "timeout":
      return "Processing timed out. Your upload is safe — retry and it may finish faster.";
    case "cancelled":
      return "Upload cancelled. Nothing was changed.";
    default:
      return "Upload didn't finish. Your other files are safe — retry or pick a different source.";
  }
}

export function mapExportError(reason?: string): string {
  if (reason?.includes("credit")) {
    return "Export needs more credits. Upgrade or wait for your balance to refresh.";
  }
  if (reason?.includes("billing")) {
    return "Billing check failed. Confirm your plan, then retry export.";
  }
  return "Export didn't complete. Your timeline is unchanged — retry export when ready.";
}
