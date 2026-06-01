import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import DashboardClient from "@/components/DashboardClient";

export const runtime = "nodejs";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <TopBar email={user.email} />
      <DashboardClient hasKey={Boolean(user.ollamaKeyEnc)} />
    </>
  );
}
