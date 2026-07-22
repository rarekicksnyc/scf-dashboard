"use client";

// Shows who is signed in and a log-out button. Replaces the old free role
// switcher — you are now the user you logged in as.
export default function SessionBar({ name, roleLabel }: { name: string; roleLabel: string }) {
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="role-switcher">
      <div className="role-switcher-label">Signed in as</div>
      <div style={{ fontWeight: 600 }}>{name}</div>
      <div className="role-switcher-role">{roleLabel}</div>
      <button
        onClick={logout}
        type="button"
        className="btn secondary"
        style={{ marginTop: 10, padding: "4px 10px", fontSize: 12 }}
      >
        Log out
      </button>
    </div>
  );
}
