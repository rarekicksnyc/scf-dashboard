import {
  getCurrentUser,
  roleHas,
  ALL_PERMISSIONS,
  PERMISSION_LABEL,
  listUsers,
} from "@/lib/auth";
import { rolePermissionMap, listCoverage, allSellers, allObligors, listRoleKeys, roleLabelOf, isBuiltinRole } from "@/lib/data/store";
import { RolesMatrix, UserRoles } from "./AccessControls";
import CoverageManager from "./CoverageManager";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "MANAGE_ROLES")) {
    return (
      <>
        <h1 className="page-title">Roles &amp; Access</h1>
        <div className="notice err">
          Your role cannot manage access. Only a Portfolio Manager or Administrator
          can change role permissions or add users.
        </div>
      </>
    );
  }

  const roleKeys = listRoleKeys();
  const roleLabelMap = Object.fromEntries(roleKeys.map((k) => [k, roleLabelOf(k)]));
  const builtins = roleKeys.filter(isBuiltinRole);

  return (
    <>
      <h1 className="page-title">Roles &amp; Access</h1>
      <p className="page-sub">
        Control the authority model: add or remove roles, grant or revoke each
        permission per role, and assign a role to each user. Changes take effect
        immediately and are audited. (Administrator keeps Manage roles to prevent
        lockout; built-in roles cannot be deleted.)
      </p>

      <RolesMatrix
        roles={roleKeys}
        builtins={builtins}
        permissions={ALL_PERMISSIONS}
        permissionLabel={PERMISSION_LABEL}
        roleLabel={roleLabelMap}
        map={rolePermissionMap()}
      />

      <UserRoles users={listUsers()} roles={roleKeys} roleLabel={roleLabelMap} />

      <CoverageManager
        users={listUsers().map((u) => ({ id: u.id, name: u.name, roleLabel: roleLabelOf(u.role) }))}
        sellers={allSellers().map((s) => ({ id: s.id, name: s.name }))}
        obligors={allObligors().map((o) => ({ id: o.id, name: o.name }))}
        coverage={listCoverage()}
      />
    </>
  );
}
