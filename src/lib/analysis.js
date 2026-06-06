import { prisma } from "@/lib/prisma";

// Key under which an analysis variant is stored. We treat the `opts` JSON
// payload as part of the cache key so different summary modes / question
// difficulties are stored separately.
export function analysisKey(which, opts) {
  if (!opts || Object.keys(opts).length === 0) return { which, opts: null };
  return { which, opts: JSON.stringify(opts || {}) };
}

// Load a cached analysis (full markdown content) or null.
export async function getCachedAnalysis(paperId, which, opts) {
  const key = analysisKey(which, opts);
  const row = await prisma.analysis.findUnique({
    where: { paperId_which_opts: { paperId, which: key.which, opts: key.opts } },
  });
  return row?.content || null;
}

// Persist a generated analysis for a paper.
export async function saveAnalysis(paperId, which, opts, content) {
  const key = analysisKey(which, opts);
  await prisma.analysis.upsert({
    where: { paperId_which_opts: { paperId, which: key.which, opts: key.opts } },
    create: { paperId, which: key.which, opts: key.opts, content },
    update: { content, updatedAt: new Date() },
  });
}

// List every cached analysis for a paper, in display order.
export async function listAnalyses(paperId) {
  const rows = await prisma.analysis.findMany({
    where: { paperId },
    orderBy: { createdAt: "asc" },
    select: { id: true, which: true, opts: true, updatedAt: true },
  });
  return rows;
}
