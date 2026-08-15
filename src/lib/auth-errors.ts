/**
 * Supabase surfaces raw API strings ("Invalid login credentials", "AuthApiError").
 * They leak implementation detail and rarely tell someone what to do next, so
 * they are mapped to plain instructions before they reach a form.
 */
const ERROR_PATTERNS: Array<{ match: RegExp; message: string }> = [
  {
    match: /invalid login credentials|invalid credentials/i,
    message: "That email and password don't match. Check them and try again.",
  },
  {
    match: /email not confirmed/i,
    message: "Confirm your email first — check your inbox for the link we sent.",
  },
  {
    match: /user already registered|already been registered/i,
    message: "That email already has an account. Sign in instead.",
  },
  {
    match: /password should be at least/i,
    message: "Your password is too short — use at least 8 characters.",
  },
  {
    match: /unable to validate email|invalid format/i,
    message: "That email address doesn't look right.",
  },
  {
    match: /for security purposes|rate limit|too many requests/i,
    message: "Too many attempts. Wait a moment before trying again.",
  },
  {
    match: /same password/i,
    message: "Your new password must be different from the old one.",
  },
  {
    match: /expired|invalid token|token has expired/i,
    message: "That link has expired. Request a new one.",
  },
  {
    match: /failed to fetch|network|offline/i,
    message: "Couldn't reach Huntr. Check your connection and try again.",
  },
];

export function humanizeAuthError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (!raw) return fallback;

  const known = ERROR_PATTERNS.find((entry) => entry.match.test(raw));
  return known ? known.message : fallback;
}

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRule {
  label: string;
  passed: boolean;
}

/** Live checklist shown while someone types, so requirements are never a surprise. */
export function checkPassword(password: string): PasswordRule[] {
  return [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, passed: password.length >= PASSWORD_MIN_LENGTH },
    { label: "One uppercase letter", passed: /[A-Z]/.test(password) },
    { label: "One number", passed: /\d/.test(password) },
  ];
}

export function passwordMeetsRules(password: string): boolean {
  return checkPassword(password).every((rule) => rule.passed);
}
