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

const sel = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };

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
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>(roles[roles.length - 1] ?? "VIEWER");
  const [msg, setMsg] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg((await res.json()).error ?? "Failed.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function addUser() {
    if (!newName.trim()) { setMsg("Enter a name."); return; }
    if (await post({ kind: "USER_ADD", name: newName.trim(), password: newPassword, role: newRole })) {
      setNewName("");
      setNewPassword("");
    }
  }

  return (
    <div className="panel">
      <h2>Users</h2>
      <div style={{ padding: "12px 14px 0" }}>
        {msg && <div className="notice err" style={{ marginBottom: 10 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 6 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11 }} className="muted">New user name
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Jamie Lee" style={{ ...sel, minWidth: 200 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11 }} className="muted">Password
            <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="blank = demo1234" style={sel} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11 }} className="muted">Role
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} style={sel}>
              {roles.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
            </select>
          </label>
          <button className="btn" type="button" onClick={addUser} disabled={busy}>Add user</button>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Assigned role</th>
              <th>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} user={u} roles={roles} roleLabel={roleLabel} busy={busy}
                onRename={(name) => post({ kind: "USER_RENAME", userId: u.id, name })}
                onRole={(role) => post({ kind: "USER_ROLE", userId: u.id, role })}
                onDelete={() => post({ kind: "USER_DELETE", userId: u.id })} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({
  user, roles, roleLabel, busy, onRename, onRole, onDelete,
}: {
  user: User; roles: Role[]; roleLabel: Record<Role, string>; busy: boolean;
  onRename: (name: string) => Promise<boolean>; onRole: (role: Role) => Promise<boolean>; onDelete: () => Promise<boolean>;
}) {
  const [name, setName] = useState(user.name);
  return (
    <tr>
      <td>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...sel, minWidth: 180 }} />
          {name.trim() !== user.name && (
            <button className="btn secondary" style={{ padding: "4px 9px", fontSize: 12 }} type="button" disabled={busy}
              onClick={() => onRename(name.trim())}>Save name</button>
          )}
        </div>
      </td>
      <td>
        <select value={user.role} disabled={busy} onChange={(e) => onRole(e.target.value as Role)} style={sel}>
          {roles.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
        </select>
      </td>
      <td>
        <button className="btn secondary" style={{ padding: "4px 9px", fontSize: 12, color: "var(--red)" }} type="button" disabled={busy}
          onClick={() => { if (confirm(`Delete user "${user.name}"?`)) onDelete(); }}>Delete</button>
      </td>
    </tr>
  );
}
