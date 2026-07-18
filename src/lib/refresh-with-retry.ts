"use client";

import type { useRouter } from "next/navigation";

type AppRouter = ReturnType<typeof useRouter>;

/**
 * `router.refresh()` re-fetches the current route's RSC payload in the
 * background and swaps it in — but if that fetch hits a transient backend
 * error (we've seen intermittent 503s from the hosting/DB layer under
 * concurrent load), it fails silently: no error, no retry, the screen just
 * keeps showing stale data even though the save itself succeeded.
 *
 * This showed up concretely as "I created an item, got the success toast,
 * but it's not in the list" — the create worked, the refresh didn't.
 *
 * Fix: fire a couple of short-delayed follow-up refreshes after the first
 * one. A single blip is the common case, so a retry ~700ms later almost
 * always lands and the list quietly corrects itself. This masks transient
 * infra flakiness — it doesn't address the root cause, which is on the
 * hosting/Supabase side and should still be investigated separately.
 */
export function refreshWithRetry(router: AppRouter, attempts = 2, delayMs = 700) {
  router.refresh();
  for (let i = 1; i <= attempts; i++) {
    setTimeout(() => router.refresh(), delayMs * i);
  }
}
