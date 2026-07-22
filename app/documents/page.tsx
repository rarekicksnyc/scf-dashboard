import { allSellers, allObligors } from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { listDocuments } from "@/lib/documents";
import DocumentsClient from "./DocumentsClient";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const canEdit = await currentUserCan("CHANGE_LIMIT");
  const documents = await listDocuments();
  const sellers = allSellers().map((s) => ({ id: s.id, name: s.name }));
  const obligors = allObligors().map((o) => ({ id: o.id, name: o.name }));

  return (
    <>
      <h1 className="page-title">Documents</h1>
      <p className="page-sub">
        Central repository for program, obligor, and transaction documents — upload,
        download, replace, and delete. Files are stored securely in the database and
        every action is audited.
      </p>
      <DocumentsClient documents={documents} sellers={sellers} obligors={obligors} canEdit={canEdit} />
    </>
  );
}
