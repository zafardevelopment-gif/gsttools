/**
 * Supabase-generated database types.
 *
 * PLACEHOLDER — this file is regenerated from the live schema in Step 2 with:
 *   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 *
 * Until then we expose a permissive shape so the app type-checks. The `GST_`
 * table prefix is intentional (see project convention).
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Permissive placeholder. Real generated types replace this in Step 2.
export type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, Json>; Insert: Record<string, Json>; Update: Record<string, Json> }>;
    Views: Record<string, { Row: Record<string, Json> }>;
    Functions: Record<string, unknown>;
    Enums: Record<string, unknown>;
    CompositeTypes: Record<string, unknown>;
  };
};
