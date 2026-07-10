/**
 * Centralised, validated access to environment variables.
 *
 * - Public vars (NEXT_PUBLIC_*) are safe to read on the client.
 * - Server-only vars (service-role key, Razorpay secret, etc.) must NEVER be
 *   imported into a Client Component. They are read lazily so that a missing
 *   server secret does not crash client bundles.
 *
 * Public env is parsed leniently: if Supabase isn't configured yet the app
 * still boots (landing page renders) and `isSupabaseConfigured` is false, so
 * the proxy and data layers can short-circuit with a clear message instead of
 * crashing the whole dev server.
 */
import { z } from "zod";

// ---- Public (client-safe) ---------------------------------------------------
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

// On Vercel, fall back to the deployment URL when NEXT_PUBLIC_SITE_URL isn't
// set — otherwise server-generated links (PDF share, WhatsApp) say localhost.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: siteUrl,
});

export const isSupabaseConfigured = parsedPublic.success;

// -----------------------------------------------------------------------------
// TEMPORARY dev auth bypass. Set NEXT_PUBLIC_AUTH_DISABLED=true in .env.local to
// skip login/OTP and run the app as the seeded demo tenant (see DEMO_TENANT_ID).
// Remove this flag / set it to false once real OTP auth is wired up.
// -----------------------------------------------------------------------------
export const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED === "true";

// Fixed UUID of the demo tenant created by supabase/seed/seed.sql.
export const DEMO_TENANT_ID = "11111111-1111-1111-1111-111111111111";

/** Public env values. Falls back to safe placeholders when not configured. */
export const publicEnv = parsedPublic.success
  ? parsedPublic.data
  : {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "not-configured",
      NEXT_PUBLIC_SITE_URL:
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    };

if (!parsedPublic.success && typeof window === "undefined") {
  // Surface a single, clear warning on the server when env is missing.
  console.warn(
    "[env] Supabase env vars are not set. Copy .env.example to .env.local and fill them in. Auth and data features are disabled until then.",
  );
}

// ---- Server-only ------------------------------------------------------------
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RAZORPAY_KEY_ID: z.string().optional().default(""),
  RAZORPAY_KEY_SECRET: z.string().optional().default(""),
  /** Comma-separated emails allowed into the internal super-admin panel. */
  SUPERADMIN_EMAILS: z.string().optional().default(""),
});

export function getServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() must only be called on the server.");
  }
  return serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    SUPERADMIN_EMAILS: process.env.SUPERADMIN_EMAILS,
  });
}
