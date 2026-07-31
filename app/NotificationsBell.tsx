"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DigestItem { id: string; label: string; sub?: string; href?: string }
interface Digest { maturing: DigestItem[]; reservationsToday: DigestItem[]; limitsDue: DigestItem[] }
interface Evt { id: string; type: string; title: string; body: string; href?: string; createdAt: string; readAt?: string }
interface Feed { digest: Digest; events: Evt[]; unreadEvents: number; approvals: number; badge: number }

// The notification bell (top of the sidebar). Shows a coverage-routed feed: stored
// alerts (exceptions, with read/unread) plus the live digest — transactions
// maturing today, reservations funding today, and covered limits due within 30
// days. Polls quietly; pauses when the tab is hidden.
export default function NotificationsBell() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) setFeed(await res.json());
    } catch { /* offline; keep last */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 45000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markRead(id: string) { await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "read", id }) }); load(); }
  async function markAll() { await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "readAll" }) }); load(); }

  const badge = feed?.badge ?? 0;
  const d = feed?.digest;
  const total = d ? d.maturing.length + d.reservationsToday.length + d.limitsDue.length : 0;
  const events = feed?.events ?? [];

  return (
    <div ref={ref} style={{ position: "relative", padding: "0 14px 6px" }}>
      <button type="button" onClick={() => { setOpen((o) => !o); if (!open) load(); }} aria-label="Notifications"
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8, padding: "7px 10px", color: "inherit", cursor: "pointer", fontSize: 13 }}>
        <span aria-hidden style={{ fontSize: 15 }}>🔔</span>
        <span>Notifications</span>
        {badge > 0 && <span style={{ marginLeft: "auto", background: "var(--red)", color: "#fff", borderRadius: 10, fontSize: 11, fontWeight: 700, padding: "1px 7px", minWidth: 18, textAlign: "center" }}>{badge}</span>}
      </button>

      {open && (
        <div style={{ position: "absolute", top: "100%", left: 14, right: 14, zIndex: 50, background: "var(--surface, #fff)", color: "var(--ink, #111)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.25)", maxHeight: 460, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            {(feed?.unreadEvents ?? 0) > 0 && <button type="button" onClick={markAll} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--brand)", cursor: "pointer", fontSize: 12 }}>Mark all read</button>}
          </div>

          {(feed?.approvals ?? 0) > 0 && (
            <Section title="Awaiting your approval">
              <Row href="/exceptions">
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>{feed!.approvals} limit{feed!.approvals === 1 ? "" : "s"}/sublimit{feed!.approvals === 1 ? "" : "s"} need four-eyes approval</div>
                <div className="muted" style={{ fontSize: 12 }}>Exceptions → Limit approvals</div>
              </Row>
            </Section>
          )}

          {events.length > 0 && (
            <Section title="Alerts">
              {events.map((e) => (
                <Row key={e.id} href={e.href} onNav={() => markRead(e.id)} highlight={!e.readAt}>
                  <div style={{ fontWeight: e.readAt ? 500 : 700, fontSize: 12.5 }}>{e.title}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{e.body}</div>
                </Row>
              ))}
            </Section>
          )}

          <Section title={`Maturing today (${d?.maturing.length ?? 0})`}>{list(d?.maturing)}</Section>
          <Section title={`Reservations today (${d?.reservationsToday.length ?? 0})`}>{list(d?.reservationsToday)}</Section>
          <Section title={`Limits due ≤ 30d (${d?.limitsDue.length ?? 0})`}>{list(d?.limitsDue)}</Section>

          {total === 0 && events.length === 0 && (feed?.approvals ?? 0) === 0 && <div className="muted" style={{ padding: 16, fontSize: 12 }}>Nothing in your coverage right now.</div>}
        </div>
      )}
    </div>
  );
}

function list(items?: DigestItem[]) {
  if (!items || items.length === 0) return <div className="muted" style={{ padding: "6px 12px", fontSize: 12 }}>None.</div>;
  return items.map((i) => (
    <Row key={i.id} href={i.href}>
      <div style={{ fontSize: 12.5 }}>{i.label}</div>
      {i.sub && <div className="muted" style={{ fontSize: 12 }}>{i.sub}</div>}
    </Row>
  ));
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ padding: "6px 12px 2px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-soft, #667)" }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ children, href, onNav, highlight }: { children: React.ReactNode; href?: string; onNav?: () => void; highlight?: boolean }) {
  const style: React.CSSProperties = { display: "block", padding: "8px 12px", borderTop: "1px solid var(--border)", textDecoration: "none", color: "inherit", background: highlight ? "var(--brand-soft, rgba(0,80,200,0.06))" : "transparent", cursor: href ? "pointer" : "default" };
  if (href) return <a href={href} onClick={onNav} style={style}>{children}</a>;
  return <div style={style}>{children}</div>;
}
