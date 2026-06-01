"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_TENANT_COOKIE } from "@/lib/tenant";
import { authDisabled } from "@/lib/env";
import { DEV_AUTH_COOKIE } from "@/lib/auth";

// TEMPORARY dev credentials for the local email+password login (no OTP/email).
// Override in .env.local with DEV_AUTH_EMAIL / DEV_AUTH_PASSWORD.
const DEV_EMAIL = process.env.DEV_AUTH_EMAIL ?? "admin@gst.local";
const DEV_PASSWORD = process.env.DEV_AUTH_PASSWORD ?? "admin123";

export type DevSignInState = { error?: string };

/**
 * Local email+password sign-in for dev mode (NEXT_PUBLIC_AUTH_DISABLED=true).
 * No Supabase Auth / email — just checks the configured credentials, sets the
 * dev-auth cookie, and redirects to /dashboard. Designed for useActionState:
 * returns { error } on failure, and never throws on the happy path (the
 * NEXT_REDIRECT control-flow signal is re-thrown so Next can handle it).
 */
export async function devSignIn(
  _prev: DevSignInState,
  formData: FormData,
): Promise<DevSignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (
    email.toLowerCase() !== DEV_EMAIL.toLowerCase() ||
    password !== DEV_PASSWORD
  ) {
    return { error: "Invalid email or password." };
  }

  const cookieStore = await cookies();
  cookieStore.set(DEV_AUTH_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect("/dashboard");
}

/** Sign the user out and return to the login page. */
export async function signOutAction() {
  const cookieStore = await cookies();
  if (authDisabled) {
    cookieStore.delete(DEV_AUTH_COOKIE);
    cookieStore.delete(ACTIVE_TENANT_COOKIE);
    redirect("/login");
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  cookieStore.delete(ACTIVE_TENANT_COOKIE);
  redirect("/login");
}

/**
 * Switch the active tenant. Validates membership (RLS-protected query) before
 * trusting the requested tenant id, then sets the cookie.
 */
export async function setActiveTenantAction(tenantId: string) {
  // Dev mode has a single demo tenant; nothing to switch.
  if (authDisabled) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("GST_memberships")
    .select("tenant_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!membership) {
    throw new Error("You are not a member of that business.");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
