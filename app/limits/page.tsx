import { redirect } from "next/navigation";

// The Limit Register no longer has its own tab — it now lives inside Data
// Management. Keep this route working by redirecting anyone with the old link.
export default function LimitsPage() {
  redirect("/data");
}
