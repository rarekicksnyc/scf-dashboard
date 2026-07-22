import { redirect } from "next/navigation";

// Setup was folded into Data Management (the single control center for adding
// and editing every feed). Keep the old link working.
export default function SetupPage() {
  redirect("/data");
}
