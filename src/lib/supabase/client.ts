/**
 * Browser-side Supabase client.
 *
 * Uses the ANON key only. All data access is still protected by Postgres RLS,
 * so the anon key in the browser cannot read another tenant's rows.
 * Use this in Client Components.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";

export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
