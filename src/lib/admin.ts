import "server-only";
import { getServerEnv, authDisabled } from "@/lib/env";
import { DEV_SUPERADMIN_EMAIL } from "@/lib/auth";

/** True if the email is in the SUPERADMIN_EMAILS allow-list (case-insensitive). */
export function isSuperAdmin(email?: string | null): boolean {
  if (!email) return false;
  // Dev mode: the built-in superadmin persona is always allowed.
  if (authDisabled && email.toLowerCase() === DEV_SUPERADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  const list = getServerEnv()
    .SUPERADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
