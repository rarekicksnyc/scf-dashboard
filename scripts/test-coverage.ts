import { store, addCoverage, usersCoveringEntity, coveredEntityIds, addNotification, listNotificationsForUser, unreadNotificationCount, markNotificationRead, notifyWorkflowException } from "@/lib/data/store";
import { coverageDigest } from "@/lib/notifications";
import type { TransactionWorkflow, User } from "@/lib/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n + "  " + x)); };

// Two PM users covering the same obligor (OOO backup); one is the maker.
const maker: User = { id: "u_maker", name: "Maker PM", role: "PRODUCT_MANAGER", passwordHash: "x" } as User;
const backup: User = { id: "u_backup", name: "Backup PM", role: "PRODUCT_MANAGER", passwordHash: "x" } as User;
const ops: User = { id: "u_ops", name: "Ops", role: "OPERATIONS", passwordHash: "x" } as User;
store.users.push(maker, backup, ops);

const sid = store.sellers[0].id;
const oid = store.obligors[0].id;
addCoverage({ userId: maker.id, entityType: "OBLIGOR", entityId: oid });
addCoverage({ userId: backup.id, entityType: "OBLIGOR", entityId: oid });
addCoverage({ userId: ops.id, entityType: "OBLIGOR", entityId: oid });
addCoverage({ userId: maker.id, entityType: "SELLER", entityId: sid });

console.log("Coverage + notifications");
ok("dedupe: adding same coverage twice returns undefined", addCoverage({ userId: maker.id, entityType: "OBLIGOR", entityId: oid }) === undefined);
ok("usersCoveringEntity lists all three", usersCoveringEntity("OBLIGOR", oid).length >= 3);
ok("coveredEntityIds splits seller/obligor", coveredEntityIds(maker.id).sellers.has(sid) && coveredEntityIds(maker.id).obligors.has(oid));

// Exception routing: notify co-covering approvers (PMs) except the maker; NOT ops (no APPROVE_EXCEPTION).
const wf = { id: "wfx", reference: "TF-X", sellerId: sid, obligorId: oid, sellerName: "S", obligorName: "O" } as unknown as TransactionWorkflow;
const before = unreadNotificationCount(backup.id);
notifyWorkflowException(wf, maker.id);
ok("backup PM notified of exception", unreadNotificationCount(backup.id) === before + 1);
ok("maker NOT notified of own exception", unreadNotificationCount(maker.id) === 0);
ok("ops (no approve perm) NOT notified", unreadNotificationCount(ops.id) === 0);

// Read state
const ev = listNotificationsForUser(backup.id)[0];
ok("event has exception type + href", ev.type === "EXCEPTION" && ev.href === "/eligibility");
markNotificationRead(ev.id, backup.id);
ok("mark read clears unread", unreadNotificationCount(backup.id) === 0);

// Digest routing: a booking maturing today for the covered obligor shows for the maker.
const today = "2026-08-15";
store.bookedTransactions.unshift({ id: "BKD-DG", source: "BOOKED", sellerId: sid, obligorId: oid, productType: "DTR", reference: "INV-DG", currency: "USD", amount: 4_000_000, valueDate: "2026-05-17", maturityDate: today, pricingBps: 125, baseRatePct: 4.5, bookedAt: "2026-05-17T00:00:00Z", bookedBy: "pm" } as never);
const dg = coverageDigest(maker.id, today);
ok("maturing-today shows for covering user", dg.maturing.some((m) => m.id === "BKD-DG"));
ok("uncovered user sees nothing", coverageDigest("u_nobody", today).maturing.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
