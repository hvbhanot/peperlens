import { redirect } from "next/navigation";
import { Suspense } from "react";
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
      <Suspense fallback={<div className="muted" style={{ padding: 40 }}>Loading…</div>}>
        <DashboardClient hasKey={Boolean(user.ollamaKeyEnc)} />
      </Suspense>
    </>
  );
}
