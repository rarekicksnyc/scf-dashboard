import { cookies } from "next/headers";
import type { User, Role, Permission } from "@/lib/types";
import {
  getUsers,
  storeGetUserById,
  permissionsForRole,
  roleHasPermission,
} from "@/lib/data/store";

// ---------------------------------------------------------------------------
// Simulated authentication for the MVP. Real deployments front this with SSO
// (SAML / OIDC via Azure AD). Here the acting user is selected via a cookie so
// the maker-checker separation and permission gating can be exercised without
// an identity provider.
//
// Users and the role → permission map live in the store (lib/data/store.ts) so
// they can be edited at runtime on the Roles & Access screen. This module is the
// facade the rest of the app reads through.
// ---------------------------------------------------------------------------

export const ROLE_LABEL: Record<Role, string> = {
  OPERATIONS: "Operations",
  CREDIT_OFFICER: "Credit Officer",
  PRODUCT_MANAGER: "Product Manager",
  RELATIONSHIP_MANAGER: "Relationship Manager",
  RISK_MANAGER: "Risk Manager",
  ADMIN: "Administrator",
  VIEWER: "Viewer",
};

export const ALL_ROLES: Role[] = [
  "OPERATIONS",
  "CREDIT_OFFICER",
  "PRODUCT_MANAGER",
  "RELATIONSHIP_MANAGER",
  "RISK_MANAGER",
  "ADMIN",
  "VIEWER",
];

export const ALL_PERMISSIONS: Permission[] = [
  "UPLOAD_BATCH",
  "APPROVE_EXCEPTION",
  "CHANGE_LIMIT",
  "VIEW_REPORTS",
  "VIEW_AUDIT",
  "GENERATE_PAYMENT_FILE",
  "MANAGE_ROLES",
];

export const PERMISSION_LABEL: Record<Permission, string> = {
  UPLOAD_BATCH: "Upload batch",
  APPROVE_EXCEPTION: "Approve exception",
  CHANGE_LIMIT: "Change limit",
  VIEW_REPORTS: "View reports",
  VIEW_AUDIT: "View audit",
  GENERATE_PAYMENT_FILE: "Payment file",
  MANAGE_ROLES: "Manage roles",
};

export const SESSION_COOKIE = "scf_user";
const DEFAULT_USER = "u_ops";

export function listUsers(): User[] {
  return getUsers();
}

export function getUserById(id: string | undefined): User {
  return (id ? storeGetUserById(id) : undefined) ?? getUsers()[0];
}

export function permissionsFor(role: Role): Permission[] {
  return permissionsForRole(role);
}

export function roleHas(role: Role, perm: Permission): boolean {
  return roleHasPermission(role, perm);
}

// Server-side current user (reads the session cookie).
export async function getCurrentUser(): Promise<User> {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value ?? DEFAULT_USER;
  return getUserById(id);
}

export async function currentUserCan(perm: Permission): Promise<boolean> {
  const user = await getCurrentUser();
  return roleHas(user.role, perm);
}
