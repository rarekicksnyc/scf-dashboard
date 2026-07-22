"use client";

import { useState } from "react";

interface UserOpt { id: string; name: string; role: string }

export default function LoginForm({ users }: { users: UserOpt[] }) {
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, password }),
    });
    if (!res.ok) {
      setBusy(false);
      setError((await res.json()).error ?? "Login failed.");
      return;
    }
    window.location.href = "/";
  }

  const input = { border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14, width: "100%", boxSizing: "border-box" as const };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f7fb", padding: 20 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 380, background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 28, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>SCF Control Tower</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 20 }}>Seller-Led Discounting — sign in</div>

        {error && <div className="notice err" style={{ marginBottom: 12 }}>{error}</div>}

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>User</label>
        <select style={{ ...input, marginBottom: 14 }} value={userId} onChange={(e) => setUserId(e.target.value)}>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
        </select>

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Password</label>
        <input style={{ ...input, marginBottom: 18 }} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />

        <button className="btn" type="submit" disabled={busy} style={{ width: "100%", padding: "10px 12px" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
