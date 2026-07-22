import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  addSeller,
  addObligor,
  addLimit,
  addAudit,
  allSellers,
  allObligors,
} from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import type { LimitType, EntityType } from "@/lib/types";

const SELLER_LIMIT_TYPES = ["SELLER", "ASR", "SWINGLINE", "RRL", "RRL_SWINGLINE"];

// Bulk add to the register from an uploaded Excel/CSV (template from
// /api/registry/template). Each row is a SELLER, OBLIGOR, or LIMIT.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to add to the register.` }, { status: 403 });
  }

  const b = await request.json().catch(() => null);
  if (!b || (typeof b.fileBase64 !== "string" && typeof b.csv !== "string")) {
    return NextResponse.json({ error: "Expected an uploaded file." }, { status: 400 });
  }

  let raw: Record<string, unknown>[];
  try {
    const wb = typeof b.fileBase64 === "string"
      ? XLSX.read(Buffer.from(b.fileBase64, "base64"), { type: "buffer" })
      : XLSX.read(b.csv, { type: "string" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
  } catch {
    return NextResponse.json({ error: "Could not read the file." }, { status: 422 });
  }

  const norm = (row: Record<string, unknown>) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) out[k.toLowerCase().trim().replace(/\s+/g, "_")] = String(v ?? "").trim();
    return out;
  };
  const findEntity = (list: { id: string; name: string; cdl: string }[], name: string, cdl: string) =>
    list.find((e) => (cdl && e.cdl === cdl) || (name && e.name.toLowerCase() === name.toLowerCase()));

  let added = 0;
  const errors: { row: number; error: string }[] = [];

  raw.forEach((r0, i) => {
    const rowNo = i + 2; // header is row 1
    try {
      const r = norm(r0);
      if (Object.values(r).every((v) => v === "")) return; // skip blank
      const rt = (r.record_type || "").toUpperCase();
      const name = r.name;
      const cdl = r.cdl;
      const amount = Number(r.approved_limit.replace(/[$,]/g, "")) || 0;
      const tenor = Number(r.max_tenor_days) || 90;
      const expiry = r.expiry_date || "2026-12-31";
      if (!/^\d{8}$/.test(cdl)) throw new Error("cdl must be an 8-digit code");

      if (rt === "SELLER") {
        if (!name) throw new Error("name is required");
        addSeller({ name, cdl, creditLimit: amount, maxTenorDays: tenor, expiryDate: expiry });
      } else if (rt === "OBLIGOR") {
        if (!name) throw new Error("name is required");
        addObligor({ name, cdl, country: r.country || "US", masterLimit: amount, maxTenorDays: tenor, expiryDate: expiry });
      } else if (rt === "LIMIT") {
        const lt = (r.limit_type || "").toUpperCase() as LimitType;
        const isSeller = SELLER_LIMIT_TYPES.includes(lt);
        const entityType: EntityType = isSeller ? "SELLER" : "OBLIGOR";
        const ent = findEntity(isSeller ? allSellers() : allObligors(), name, cdl);
        if (!ent) throw new Error(`no ${entityType.toLowerCase()} found for '${name || cdl}' — add it first`);
        addLimit({ type: lt, cdl, entityType, entityId: ent.id, approvedLimit: amount, maxTenorDays: tenor, expiryDate: expiry });
      } else {
        throw new Error("record_type must be SELLER, OBLIGOR, or LIMIT");
      }
      added += 1;
    } catch (e) {
      errors.push({ row: rowNo, error: e instanceof Error ? e.message : String(e) });
    }
  });

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "REGISTRY_BULK_ADD",
    entityType: "REGISTRY",
    entityId: "bulk",
    detail: `Bulk added ${added} record(s)${errors.length ? `, ${errors.length} error(s)` : ""}.`,
  });

  return NextResponse.json({ ok: true, added, errors });
}
