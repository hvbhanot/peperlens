import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { searchSnippets, highlight as hili } from "@/lib/textUtil";

export const runtime = "nodejs";

export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ results: [] });

  const papers = await prisma.paper.findMany({
    where: { userId: user.id },
    select: {
      id: true, title: true, fileName: true, pages: true, level: true,
      tags: true, field: true, method: true, year: true, createdAt: true, textCache: true,
    },
  });

  const results = [];
  for (const p of papers) {
    if (!p.textCache) continue;
    const matches = searchSnippets(p.textCache, q, { limit: 3, window: 200 });
    if (!matches.length) continue;
    results.push({
      paper: {
        id: p.id, title: p.title, fileName: p.fileName, pages: p.pages, level: p.level,
        tags: p.tags, field: p.field, method: p.method, year: p.year, createdAt: p.createdAt,
      },
      snippets: matches.map((m) => ({ start: m.start, end: m.end, html: hili(m.snippet, q) })),
    });
  }
  return NextResponse.json({ results, q });
}
