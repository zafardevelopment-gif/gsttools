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
 *
 * Guarded against navigation: `router` is a stable object that persists
 * across client-side navigations, so a timer scheduled on one page can
 * still fire after the user has moved to a different page. `router.refresh()`
 * always re-fetches whatever route is current at the time it *fires*, not
 * the route it was scheduled from — so an unguarded delayed refresh from,
 * say, creating a party would silently re-render whatever page the user
 * had since navigated to (e.g. mid-way through filling the new-invoice
 * form), resetting any client-side form state there for no visible reason.
 * Captured here as a real bug: selecting a customer on Invoices > New,
 * then clicking into the item field, wiped the customer selection back to
 * empty — traced to exactly this stray delayed refresh from an item/party
 * created moments earlier on a different page. Skip the fallback refreshes
 * once the pathname has changed.
 */
export function refreshWithRetry(router: AppRouter, attempts = 2, delayMs = 700) {
  const pathname = typeof window !== "undefined" ? window.location.pathname : null;
  router.refresh();
  for (let i = 1; i <= attempts; i++) {
    setTimeout(() => {
      if (pathname !== null && window.location.pathname !== pathname) return;
      router.refresh();
    }, delayMs * i);
  }
}
