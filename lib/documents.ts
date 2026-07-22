import { randomUUID } from "crypto";
import { getPool } from "@/lib/data/persistence";

// ---------------------------------------------------------------------------
// Document repository. Files are stored in their OWN Postgres table (not the
// app-state snapshot, which loads into memory on boot). When DATABASE_URL is not
// set (local dev) an in-memory fallback is used so the feature still works.
// ---------------------------------------------------------------------------

export type AttachType = "SELLER" | "OBLIGOR" | "TRANSACTION";

export const DOC_TYPES = [
  "MASTER_RECEIVABLES_PURCHASE_AGREEMENT",
  "ASSIGNMENT_NOTICE",
  "KYB_REFRESH",
  "PARTICIPATION_AGREEMENT",
  "INSURANCE_POLICY",
  "GUARANTEE",
  "INCUMBENCY",
  "PRF",
  "SCHEDULE_A",
  "UTRC_COMMITMENT_REQUEST",
  "OTHER",
] as const;

export interface DocMeta {
  id: string;
  attachType: AttachType;
  attachId: string;
  attachLabel: string;
  docType: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
}

// In-memory fallback used when there is no database (local dev). On globalThis
// so every route module shares the one Map (and it survives dev hot-reload).
const g = globalThis as unknown as { __scfDocs?: Map<string, { meta: DocMeta; data: Buffer }> };
const mem: Map<string, { meta: DocMeta; data: Buffer }> = (g.__scfDocs ??= new Map());

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToMeta(r: any): DocMeta {
  return {
    id: r.id,
    attachType: r.attach_type,
    attachId: r.attach_id,
    attachLabel: r.attach_label,
    docType: r.doc_type,
    fileName: r.file_name,
    contentType: r.content_type,
    sizeBytes: r.size_bytes,
    uploadedBy: r.uploaded_by,
    uploadedByName: r.uploaded_by_name,
    uploadedAt: typeof r.uploaded_at === "string" ? r.uploaded_at : r.uploaded_at.toISOString(),
  };
}

export async function initDocSchema(): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `CREATE TABLE IF NOT EXISTS documents (
       id            text PRIMARY KEY,
       attach_type   text NOT NULL,
       attach_id     text NOT NULL,
       attach_label  text NOT NULL DEFAULT '',
       doc_type      text NOT NULL,
       file_name     text NOT NULL,
       content_type  text NOT NULL,
       size_bytes    integer NOT NULL,
       data          bytea NOT NULL,
       uploaded_by   text NOT NULL DEFAULT '',
       uploaded_by_name text NOT NULL DEFAULT '',
       uploaded_at   timestamptz NOT NULL DEFAULT now()
     )`,
  );
}

export async function listDocuments(): Promise<DocMeta[]> {
  const p = getPool();
  if (!p) return [...mem.values()].map((x) => x.meta).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const res = await p.query(
    `SELECT id, attach_type, attach_id, attach_label, doc_type, file_name, content_type, size_bytes, uploaded_by, uploaded_by_name, uploaded_at
     FROM documents ORDER BY uploaded_at DESC`,
  );
  return res.rows.map(rowToMeta);
}

export async function getDocument(id: string): Promise<{ meta: DocMeta; data: Buffer } | null> {
  const p = getPool();
  if (!p) return mem.get(id) ?? null;
  const res = await p.query(`SELECT * FROM documents WHERE id = $1`, [id]);
  if (!res.rows[0]) return null;
  return { meta: rowToMeta(res.rows[0]), data: res.rows[0].data };
}

export async function addDocument(
  input: { attachType: AttachType; attachId: string; attachLabel: string; docType: string; fileName: string; contentType: string; uploadedBy: string; uploadedByName: string },
  data: Buffer,
): Promise<DocMeta> {
  const meta: DocMeta = {
    id: `DOC-${randomUUID()}`,
    attachType: input.attachType,
    attachId: input.attachId,
    attachLabel: input.attachLabel,
    docType: input.docType,
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: data.length,
    uploadedBy: input.uploadedBy,
    uploadedByName: input.uploadedByName,
    uploadedAt: new Date().toISOString(),
  };
  const p = getPool();
  if (!p) {
    mem.set(meta.id, { meta, data });
    return meta;
  }
  await p.query(
    `INSERT INTO documents (id, attach_type, attach_id, attach_label, doc_type, file_name, content_type, size_bytes, data, uploaded_by, uploaded_by_name, uploaded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [meta.id, meta.attachType, meta.attachId, meta.attachLabel, meta.docType, meta.fileName, meta.contentType, meta.sizeBytes, data, meta.uploadedBy, meta.uploadedByName, meta.uploadedAt],
  );
  return meta;
}

// Replace the file on an existing document (keeps its id and attachment).
export async function replaceDocumentFile(id: string, fileName: string, contentType: string, data: Buffer): Promise<DocMeta | null> {
  const p = getPool();
  if (!p) {
    const cur = mem.get(id);
    if (!cur) return null;
    cur.meta = { ...cur.meta, fileName, contentType, sizeBytes: data.length, uploadedAt: new Date().toISOString() };
    cur.data = data;
    return cur.meta;
  }
  const res = await p.query(
    `UPDATE documents SET file_name=$2, content_type=$3, size_bytes=$4, data=$5, uploaded_at=now() WHERE id=$1
     RETURNING id, attach_type, attach_id, attach_label, doc_type, file_name, content_type, size_bytes, uploaded_by, uploaded_by_name, uploaded_at`,
    [id, fileName, contentType, data.length, data],
  );
  return res.rows[0] ? rowToMeta(res.rows[0]) : null;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const p = getPool();
  if (!p) return mem.delete(id);
  const res = await p.query(`DELETE FROM documents WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}
