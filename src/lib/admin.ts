import "server-only";
import { getServerEnv } from "@/lib/env";

/** True if the email is in the SUPERADMIN_EMAILS allow-list (case-insensitive). */
export function isSuperAdmin(email?: string | null): boolean {
  if (!email) return false;
  const list = getServerEnv()
    .SUPERADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
