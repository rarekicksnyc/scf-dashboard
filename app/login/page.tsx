import { listUsers, ROLE_LABEL } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const users = listUsers().map((u) => ({ id: u.id, name: u.name, role: ROLE_LABEL[u.role] }));
  return <LoginForm users={users} />;
}
