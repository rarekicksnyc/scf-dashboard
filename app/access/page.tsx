import {
  getCurrentUser,
  roleHas,
  ALL_ROLES,
  ALL_PERMISSIONS,
  ROLE_LABEL,
  PERMISSION_LABEL,
  listUsers,
} from "@/lib/auth";
import { rolePermissionMap } from "@/lib/data/store";
import { RolesMatrix, UserRoles } from "./AccessControls";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "MANAGE_ROLES")) {
    return (
      <>
        <h1 className="page-title">Roles &amp; Access</h1>
        <div className="notice err">
          Your role cannot manage access. Only a Product Manager or Administrator
          can change role permissions or add users.
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Roles &amp; Access</h1>
      <p className="page-sub">
        Control the authority model: grant or revoke each permission per role, and
        assign a role to each user. Changes take effect immediately and are
        audited. (Administrator keeps Manage roles to prevent lockout.)
      </p>

      <RolesMatrix
        roles={ALL_ROLES}
        permissions={ALL_PERMISSIONS}
        permissionLabel={PERMISSION_LABEL}
        roleLabel={ROLE_LABEL}
        map={rolePermissionMap()}
      />

      <UserRoles users={listUsers()} roles={ALL_ROLES} roleLabel={ROLE_LABEL} />
    </>
  );
}
