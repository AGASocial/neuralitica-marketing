import { redirect } from "next/navigation";

import { requireActive } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireActive("page");
  redirect("/dashboard");
}
