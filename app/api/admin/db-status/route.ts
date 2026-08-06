import { NextResponse } from "next/server";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { persistenceEnabled, persistAuthoritative, lastPersistError, lastPersistAt } from "@/lib/data/persistence";
import { auditTableCount, pendingAuditCount } from "@/lib/data/repositories/auditRepo";
import { collectionStatus } from "@/lib/data/repositories/collectionRepo";
import { getAuditLog, verifyAuditChain } from "@/lib/data/store";

// Migration/persistence diagnostic — lets an admin confirm that write-through
// populated the per-row tables (table count should match the in-memory count once
// a flush has run). Gated on MANAGE_ROLES; reports counts only, no record content.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "MANAGE_ROLES")) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }
  const chain = verifyAuditChain();
  return NextResponse.json({
    persistence: {
      enabled: persistenceEnabled(),
      authoritative: persistAuthoritative(),
      mode: persistAuthoritative() ? "tables authoritative (snapshot frozen as backup)" : "dual-source (snapshot + tables)",
      lastSaveAt: lastPersistAt(),
      lastError: lastPersistError(),
    },
    audit: {
      table: persistenceEnabled() ? await auditTableCount() : null,
      memory: getAuditLog().length,
      pendingWrites: pendingAuditCount(),
      chainIntact: chain.ok,
      chainEntries: chain.total,
    },
    collections: await collectionStatus(),
    note: "table === memory (after a flush) confirms write-through; -1 table means the query failed.",
  });
}
