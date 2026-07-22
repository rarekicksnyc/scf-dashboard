import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser, ROLE_LABEL, permissionsFor } from "@/lib/auth";
import SessionBar from "./SessionBar";

export const metadata: Metadata = {
  title: "SCF Discounting Control Tower",
  description:
    "Seller-led supply chain finance discounting — batch eligibility, limit control, and maker-checker workflow",
};

const NAV = [
  { href: "/", label: "Portfolio" },
  { href: "/revenue", label: "Revenue" },
  { href: "/eligibility", label: "Eligibility check" },
  { href: "/batches", label: "Batches" },
  { href: "/data", label: "Data management" },
  { href: "/documents", label: "Documents" },
  { href: "/rates", label: "Rate sheet" },
  { href: "/expirations", label: "Expirations" },
  { href: "/reservations", label: "Reservations" },
  { href: "/schedule", label: "Schedule" },
  { href: "/exceptions", label: "Exceptions" },
  { href: "/monitoring", label: "Monitoring" },
  { href: "/reports", label: "Reports", need: "VIEW_REPORTS" as const },
  { href: "/audit", label: "Audit log", need: "VIEW_AUDIT" as const },
  { href: "/access", label: "Roles & access", need: "MANAGE_ROLES" as const },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Not logged in (only the /login route is reachable here, per middleware) →
  // render the page bare, without the app shell.
  const user = await getSessionUser();
  if (!user) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  const perms = permissionsFor(user.role);

  return (
    <html lang="en">
      <body>
        <div className="layout">
          <aside className="sidebar">
            <div className="brand">SCF Control Tower</div>
            <div className="brand-sub">Seller-Led Discounting</div>
            <SessionBar name={user.name} roleLabel={ROLE_LABEL[user.role]} />
            <nav className="nav">
              {NAV.filter((n) => !n.need || perms.includes(n.need)).map((n) => (
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
