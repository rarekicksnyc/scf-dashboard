"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { User } from "@/lib/types";

// Stands in for SSO login: pick the acting user to exercise role-based access
// and maker-checker separation.
export default function RoleSwitcher({
  users,
  currentId,
  roleLabel,
}: {
  users: User[];
  currentId: string;
  roleLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setBusy(true);
    await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: e.target.value }),
    });
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="role-switcher">
      <div className="role-switcher-label">Acting as</div>
      <select value={currentId} onChange={onChange} disabled={busy}>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <div className="role-switcher-role">{roleLabel}</div>
    </div>
  );
}
