"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_TENANT_COOKIE } from "@/lib/tenant";
import { getDevRole, DEV_AUTH_COOKIE } from "@/lib/dev-session";
import { realAuthEnabled } from "@/lib/env";

// TEMPORARY dev credentials for the local email+password login (no OTP/email).
// Two personas: a platform super admin and a normal tenant end user.
// Override in .env.local with DEV_SUPERADMIN_* / DEV_USER_* if needed.
const DEV_CREDENTIALS: Record<
  string,
  { password: string; role: "superadmin" | "user" }
> = {
  [(process.env.DEV_SUPERADMIN_EMAIL ?? "superadmin@aimunim.local").toLowerCase()]:
    {
      password: process.env.DEV_SUPERADMIN_PASSWORD ?? "super123",
      role: "superadmin",
    },
  [(process.env.DEV_USER_EMAIL ?? "user@aimunim.local").toLowerCase()]: {
    password: process.env.DEV_USER_PASSWORD ?? "user123",
    role: "user",
  },
};

export type SignInState = { error?: string };

/**
 * Email+password sign-in for the /login form.
 *
 * Checks the hardcoded dev/demo personas first (no Supabase call — just sets
 * the dev-auth cookie). If the email doesn't match a dev persona, falls back
 * to real Supabase auth (signInWithPassword) — this is what lets accounts
 * log back in, whether they came from public signUpAction below (gated
 * behind realAuthEnabled) or from an owner/admin using "Create user" on
 * their Manage Users page (server/actions/users.ts createUserAction) or the
 * Super Admin Users page (createPlatformUserAction) — both of those create
 * real accounts directly with no email confirmation step, regardless of
 * realAuthEnabled, since they require already being logged in as
 * owner/admin/super-admin. Login is NOT gated behind realAuthEnabled: that
 * flag only controls whether the public /signup form can create new
 * accounts, not whether an already-existing real account can log in — a
 * user an admin just created needs to be able to log in immediately, even
 * while public signup is still closed. Designed for useActionState: returns
 * { error } on failure, and never throws on the happy path (the
 * NEXT_REDIRECT control-flow signal is re-thrown so Next can handle it).
 */
export async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const cred = DEV_CREDENTIALS[email.toLowerCase()];
  if (cred && password === cred.password) {
    const cookieStore = await cookies();
    cookieStore.set(DEV_AUTH_COOKIE, cred.role, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    // Superadmin lands on the platform panel, end users on their dashboard.
    redirect(cred.role === "superadmin" ? "/admin" : "/dashboard");
  }

  // Not a dev persona (or wrong password for one) — try a real account.
  // createClient() returns the real RLS-scoped client here since no dev
  // cookie is set yet, and signInWithPassword sets the Supabase session
  // cookies on success via that client's cookie adapter.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Invalid email or password." };
  }

  redirect("/dashboard");
}

const signUpSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email."),
    password: z.string().min(6, "Password must be at least 6 characters."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export type SignUpState = { error?: string; checkEmail?: boolean };

/**
 * Public signup — creates a real Supabase auth.users account and signs the
 * browser into that session. No business/tenant exists yet at this point;
 * onboarding/page.tsx (via requireUser + getActiveContext) picks that up
 * next and walks them through creating one. Works independently of the
 * /login dev personas — see lib/dev-session.ts. Gated behind realAuthEnabled
 * (off by default) so public signup doesn't go live before it's wanted.
 */
export async function signUpAction(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  if (!realAuthEnabled) {
    return {
      error: "New signups aren't open yet — please check back soon.",
    };
  }

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { email, password } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return {
      error: error.message.toLowerCase().includes("already registered")
        ? "An account with that email already exists — log in instead."
        : error.message,
    };
  }

  // If the Supabase project has "Confirm email" turned on, signUp() creates
  // the auth.users row but returns no session — the browser isn't actually
  // logged in yet. Redirecting to /onboarding in that case would immediately
  // bounce back to /login (requireUser finds no session), which looks like
  // signup silently failed. Show a "check your inbox" message instead.
  if (!data.session) {
    return { checkEmail: true };
  }

  redirect("/onboarding");
}

/** Sign the user out and return to the login page. */
export async function signOutAction() {
  const cookieStore = await cookies();
  if (await getDevRole()) {
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
  // Dev-persona login has a single demo tenant; nothing to switch.
  if (await getDevRole()) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("aimunim_memberships")
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
