import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  addSeller,
  addObligor,
  addLimit,
  addSellerObligorLimit,
  updateObligor,
  sellerObligorLimit,
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
      const requireCdl = () => { if (!/^\d{8}$/.test(cdl)) throw new Error("cdl must be an 8-digit code"); };
      let rowAdds = 1; // rows that fan out (ASR → all sellers) count each link

      if (rt === "SELLER") {
        if (!name) throw new Error("name is required");
        requireCdl();
        addSeller({ name, cdl, creditLimit: amount, maxTenorDays: tenor, expiryDate: expiry });
      } else if (rt === "OBLIGOR") {
        if (!name) throw new Error("name is required");
        requireCdl();
        addObligor({ name, cdl, country: r.country || "US", masterLimit: amount, maxTenorDays: tenor, expiryDate: expiry });
      } else if (rt === "LIMIT") {
        requireCdl();
        const lt = (r.limit_type || "").toUpperCase() as LimitType;
        const isSeller = SELLER_LIMIT_TYPES.includes(lt);
        const entityType: EntityType = isSeller ? "SELLER" : "OBLIGOR";
        const ent = findEntity(isSeller ? allSellers() : allObligors(), name, cdl);
        if (!ent) throw new Error(`no ${entityType.toLowerCase()} found for '${name || cdl}' — add it first`);
        addLimit({ type: lt, cdl, entityType, entityId: ent.id, approvedLimit: amount, maxTenorDays: tenor, expiryDate: expiry });
      } else if (rt === "ASR_SUBLIMIT" || rt === "FACILITY_OBLIGOR") {
        // Add an obligor to a seller's ASR (facility). Links an existing obligor
        // or creates one inline, then records the sublimit + group expiry. Set
        // seller_name (or seller_cdl) to ALL to add the obligor to EVERY seller
        // in one row; otherwise one row per seller/obligor pair.
        const allFlag = ["ALL", "ALL SELLERS", "*"].includes((r.seller_name || "").toUpperCase())
          || ["ALL", "*"].includes((r.seller_cdl || "").toUpperCase());
        let targetSellers: { id: string; name: string; cdl: string }[];
        if (allFlag) {
          targetSellers = allSellers();
        } else {
          const seller = findEntity(allSellers(), r.seller_name, r.seller_cdl);
          if (!seller) throw new Error(`no seller found for '${r.seller_name || r.seller_cdl}'`);
          targetSellers = [seller];
        }
        const obName = r.obligor_name;
        const obCdl = r.obligor_cdl;
        const sublimit = Number((r.asr_sublimit || r.approved_limit || "").replace(/[$,]/g, "")) || 0;
        const groupExpiry = r.group_expiry || r.expiry_date || "";
        let obligor = findEntity(allObligors(), obName, obCdl);
        if (!obligor) {
          if (!obName || !/^\d{8}$/.test(obCdl)) throw new Error("obligor not found — to create it, give obligor_name and an 8-digit obligor_cdl");
          if (!groupExpiry) throw new Error("group_expiry is required when creating a new obligor");
          const created = addObligor({ name: obName, cdl: obCdl, country: r.country || "US", masterLimit: Number((r.master_limit || "").replace(/[$,]/g, "")) || 0, maxTenorDays: tenor, expiryDate: groupExpiry });
          obligor = { id: created.id, name: created.name, cdl: created.cdl };
        } else if (groupExpiry) {
          updateObligor(obligor.id, { expiryDate: groupExpiry });
        }
        // Link to each target seller not already carrying it.
        let linked = 0;
        for (const s of targetSellers) {
          if (sellerObligorLimit(s.id, obligor.id)) continue;
          addSellerObligorLimit(s.id, obligor.id, sublimit, tenor);
          linked += 1;
        }
        if (linked === 0) throw new Error(`${obligor.name} is already on ${allFlag ? "every seller" : targetSellers[0].name}'s ASR`);
        rowAdds = linked;
      } else {
        throw new Error("record_type must be SELLER, OBLIGOR, LIMIT, or ASR_SUBLIMIT");
      }
      added += rowAdds;
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
