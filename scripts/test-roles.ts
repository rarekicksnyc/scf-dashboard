import { store, addRole, removeRole, listRoleKeys, roleLabelOf, isBuiltinRole, setUserRole, setRolePermission, roleHasPermission } from "@/lib/data/store";
let pass=0,fail=0; const ok=(n:string,c:boolean,x="")=>{c?(pass++,console.log("  ok  "+n)):(fail++,console.log("FAIL "+n+" "+x));};

ok("7 built-in roles present", listRoleKeys().filter(isBuiltinRole).length === 7);
// Add a custom role.
const r = addRole("Loan Ops Lead");
ok("addRole returns key", r.ok && r.key === "LOAN_OPS_LEAD");
ok("custom role listed", listRoleKeys().includes("LOAN_OPS_LEAD"));
ok("label preserved", roleLabelOf("LOAN_OPS_LEAD") === "Loan Ops Lead");
ok("custom role not builtin", !isBuiltinRole("LOAN_OPS_LEAD"));
ok("starts with no permissions", roleHasPermission("LOAN_OPS_LEAD", "UPLOAD_BATCH") === false);
setRolePermission("LOAN_OPS_LEAD", "UPLOAD_BATCH", true);
ok("can grant a permission to a custom role", roleHasPermission("LOAN_OPS_LEAD", "UPLOAD_BATCH") === true);
ok("duplicate add rejected", addRole("Loan Ops Lead").ok === false);
ok("built-in cannot be deleted", removeRole("ADMIN").ok === false);

// Assign a user, then deletion is blocked until reassigned.
const u = store.users[0]; const originalRole = u.role;
setUserRole(u.id, "LOAN_OPS_LEAD");
ok("delete blocked while a user is assigned", removeRole("LOAN_OPS_LEAD").ok === false);
setUserRole(u.id, originalRole);
ok("delete succeeds once unassigned", removeRole("LOAN_OPS_LEAD").ok === true && !listRoleKeys().includes("LOAN_OPS_LEAD"));

// Credit / Risk / Relationship Manager start VIEW-ONLY (audit only, no actions),
// while Portfolio Manager + Admin keep the action permissions (four-eyes intact).
for (const r of ["CREDIT_OFFICER", "RISK_MANAGER", "RELATIONSHIP_MANAGER"]) {
  ok(`${r} is view-only (no CHANGE_LIMIT)`, roleHasPermission(r, "CHANGE_LIMIT") === false);
  ok(`${r} is view-only (no APPROVE_EXCEPTION)`, roleHasPermission(r, "APPROVE_EXCEPTION") === false);
  ok(`${r} is view-only (no UPLOAD_BATCH)`, roleHasPermission(r, "UPLOAD_BATCH") === false);
  ok(`${r} can view audit`, roleHasPermission(r, "VIEW_AUDIT") === true);
}
ok("Portfolio Manager can still approve exceptions (four-eyes intact)", roleHasPermission("PRODUCT_MANAGER", "APPROVE_EXCEPTION") === true);
ok("Admin can still change limits", roleHasPermission("ADMIN", "CHANGE_LIMIT") === true);
// A view-only role can be granted more access at any time (the usual way).
setRolePermission("CREDIT_OFFICER", "CHANGE_LIMIT", true);
ok("PM/Admin can grant a view-only role more access", roleHasPermission("CREDIT_OFFICER", "CHANGE_LIMIT") === true);
setRolePermission("CREDIT_OFFICER", "CHANGE_LIMIT", false); // restore view-only

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
