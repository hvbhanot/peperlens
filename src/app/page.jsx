import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export default async function Home() {
  const session = await getSession();
  redirect(session?.uid ? "/dashboard" : "/login");
}
