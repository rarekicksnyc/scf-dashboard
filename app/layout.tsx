import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, listUsers, ROLE_LABEL, permissionsFor } from "@/lib/auth";
import RoleSwitcher from "./RoleSwitcher";

export const metadata: Metadata = {
  title: "SCF Discounting Control Tower",
  description:
    "Seller-led supply chain finance discounting — batch eligibility, limit control, and maker-checker workflow",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const perms = permissionsFor(user.role);

  const nav = [
    { href: "/", label: "Portfolio" },
    { href: "/revenue", label: "Revenue" },
    { href: "/eligibility", label: "Eligibility check" },
    { href: "/batches", label: "Batches" },
    { href: "/limits", label: "Limit register" },
    { href: "/data", label: "Data management" },
    { href: "/rates", label: "Rate sheet" },
    { href: "/expirations", label: "Expirations" },
    { href: "/reservations", label: "Reservations" },
    { href: "/schedule", label: "Schedule" },
    { href: "/exceptions", label: "Exceptions" },
    { href: "/monitoring", label: "Monitoring" },
    { href: "/reports", label: "Reports", need: "VIEW_REPORTS" as const },
    { href: "/audit", label: "Audit log", need: "VIEW_AUDIT" as const },
    { href: "/setup", label: "Setup", need: "CHANGE_LIMIT" as const },
    { href: "/access", label: "Roles & access", need: "MANAGE_ROLES" as const },
  ];

  return (
    <html lang="en">
      <body>
        <div className="layout">
          <aside className="sidebar">
            <div className="brand">SCF Control Tower</div>
            <div className="brand-sub">Seller-Led Discounting</div>
            <RoleSwitcher
              users={listUsers()}
              currentId={user.id}
              roleLabel={ROLE_LABEL[user.role]}
            />
            <nav className="nav">
              {nav
                .filter((n) => !n.need || perms.includes(n.need))
                .map((n) => (
                  <Link key={n.href} href={n.href}>
                    {n.label}
                  </Link>
                ))}
            </nav>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
