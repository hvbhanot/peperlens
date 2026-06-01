import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PaperLensViewer from "@/components/PaperLensViewer";

export const runtime = "nodejs";

export default async function PaperPage({ params }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const paper = await prisma.paper.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true, title: true, fileName: true, level: true },
  });
  if (!paper) notFound();

  return (
    <PaperLensViewer
      paperId={paper.id}
      title={paper.title}
      fileName={paper.fileName}
      initialLevel={paper.level}
    />
  );
}
