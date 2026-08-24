import { redirect } from "next/navigation";
import { getSessionUser, dashboardPathFor } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(dashboardPathFor(user.role));
}
