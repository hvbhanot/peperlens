import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import SettingsClient from "@/components/SettingsClient";

export const runtime = "nodejs";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <TopBar email={user.email} />
      <SettingsClient />
    </>
  );
}
