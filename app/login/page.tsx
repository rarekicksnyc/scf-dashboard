import { listUsers, ROLE_LABEL } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const users = listUsers().map((u) => ({ id: u.id, name: u.name, role: ROLE_LABEL[u.role] }));
  // Show the shared demo password ONLY while the built-in default is still in
  // effect. The moment a real DEMO_PASSWORD (or SSO) is configured, the hint
  // disappears on its own — so it helps the pilot team without leaking anything
  // once the tool is set up for real use.
  const demoPassword = process.env.DEMO_PASSWORD ?? "demo1234";
  const demoHint = demoPassword === "demo1234" ? demoPassword : undefined;
  return <LoginForm users={users} demoHint={demoHint} />;
}
