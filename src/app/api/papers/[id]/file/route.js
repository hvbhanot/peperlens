import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// Streams the raw PDF bytes back to the owner. pdf.js fetches this URL with the
// session cookie attached (same-origin), so ownership is enforced here.
export async function GET(_req, { params }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const paper = await prisma.paper.findFirst({
    where: { id: params.id, userId: user.id },
    select: { data: true, fileName: true },
  });
  if (!paper) return new Response("Not found", { status: 404 });

  const body = Buffer.from(paper.data);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(body.length),
      "Content-Disposition": `inline; filename="${encodeURIComponent(paper.fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
