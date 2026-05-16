// Maps NextAuth error codes and raw API messages to clean, user-facing strings.
// Import mapAuthError in auth pages, mapApiError for all fetch/axios call sites.

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

// Safe messages that can be shown directly to the user from the register API
const SAFE_API_PREFIXES = [
  "Please fill all fields",
  "User already exists",
  "Password must be",
  "Email already",
  "Account created",
];

export function mapAuthError(error: string | undefined | null): string {
  if (!error) return "";
  return AUTH_ERROR_MAP[error] ?? AUTH_ERROR_MAP.Default;
}

export function mapApiError(message: string | undefined | null): string {
  if (!message) return "Something went wrong. Please try again.";
  if (SAFE_API_PREFIXES.some((prefix) => message.startsWith(prefix))) return message;
  return "Something went wrong. Please try again.";
}
