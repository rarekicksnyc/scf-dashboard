"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sidebar links with an active-page indicator (the server layout can't read the
// pathname). Highlights the current route so the user always knows where they
// are in the 17-item nav.
export default function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <>
      {items.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            {n.label}
          </Link>
        );
      })}
    </>
  );
}
