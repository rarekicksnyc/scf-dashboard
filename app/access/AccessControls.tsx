"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role, Permission, User } from "@/lib/types";

export function RolesMatrix({
  roles,
  permissions,
  permissionLabel,
  roleLabel,
  map,
}: {
  roles: Role[];
  permissions: Permission[];
  permissionLabel: Record<Permission, string>;
  roleLabel: Record<Role, string>;
  map: Record<Role, Permission[]>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle(role: Role, perm: Permission, enabled: boolean) {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "ROLE_PERM", role, permission: perm, enabled }),
    });
    if (!res.ok) setErr((await res.json()).error ?? "Failed.");
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="panel">
      <h2>Role permissions</h2>
      {err && <div className="notice err" style={{ margin: "12px 14px 0" }}>{err}</div>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Role</th>
              {permissions.map((p) => (
                <th key={p} style={{ textAlign: "center" }}>{permissionLabel[p]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role}>
                <td style={{ fontWeight: 600 }}>{roleLabel[role]}</td>
                {permissions.map((p) => {
                  const on = map[role].includes(p);
                  return (
                    <td key={p} style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={busy}
                        onChange={(e) => toggle(role, p, e.target.checked)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function UserRoles({
  users,
  roles,
  roleLabel,
}: {
  users: User[];
  roles: Role[];
  roleLabel: Record<Role, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function assign(userId: string, role: Role) {
    setBusy(true);
    await fetch("/api/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "USER_ROLE", userId, role }),
    });
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="panel">
      <h2>User role assignment</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Assigned role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>
                  <select
                    value={u.role}
                    disabled={busy}
                    onChange={(e) => assign(u.id, e.target.value as Role)}
                    style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13 }}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>{roleLabel[r]}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
