import { redirect } from "next/navigation";

import { getCurrentUser, type CurrentUser } from "@/lib/auth/get-current-user";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user: CurrentUser | null = await getCurrentUser();

  if (!user) {
    redirect("/login?next=/");
  }

  if (!user.active) {
    redirect("/pending");
  }

  redirect("/dashboard");
}
