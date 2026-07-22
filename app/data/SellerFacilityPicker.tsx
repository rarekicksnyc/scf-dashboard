"use client";

import { useRouter } from "next/navigation";

// Dropdown to pick the seller facility (scales past a handful of tab links).
export default function SellerFacilityPicker({
  sellers,
  current,
}: {
  sellers: { id: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  return (
    <div className="row-actions" style={{ alignItems: "center" }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>Seller facility:</span>
      <select
        value={current}
        onChange={(e) => router.push(`/data?seller=${e.target.value}`)}
        style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", fontSize: 14, minWidth: 280 }}
      >
        {sellers.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}
