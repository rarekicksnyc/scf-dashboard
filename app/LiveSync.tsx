"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Live sync. Polls the global change counter and refreshes the current view only
// when it moves — so a change made by any user shows up on everyone else's screen
// within one poll, while idle screens (and idle desks) never refresh needlessly.
// Pauses while the tab is hidden and never yanks a form the user is mid-edit in.
export default function LiveSync({ initialRev, intervalMs = 12000 }: { initialRev: number; intervalMs?: number }) {
  const router = useRouter();
  const lastRev = useRef(initialRev);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const res = await fetch("/api/revision", { cache: "no-store" });
          if (res.ok) {
            const { rev } = await res.json();
            if (typeof rev === "number" && rev > lastRev.current) {
              const el = document.activeElement;
              const editing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
              // Defer the refresh until the user is not typing (it will apply on a
              // later tick once they blur), so live sync never disrupts an edit.
              if (!editing) {
                lastRev.current = rev;
                router.refresh();
              }
            }
          }
        } catch {
          // Offline or transient — just try again next tick.
        }
      }
      timer = setTimeout(poll, intervalMs);
    }

    timer = setTimeout(poll, intervalMs);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return null;
}
