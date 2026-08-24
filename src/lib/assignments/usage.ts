import "server-only";
import { prisma } from "../prisma";
import { AI_MODELS } from "../ai/engines";

export type AssignmentUsageStats = {
  totalGenerations: number;
  totalTokens: number;
  totalCostUsd: number;
  byEngine: { engine: string; label: string; generations: number; tokens: number; costUsd: number }[];
};

// Aggregates AI spend across every Assignment that was ever generated or
// improved by AI (source AI | AI_IMPROVED, engine not null — a purely
// manually-authored Assignment has no usage to count). This is the ONLY
// place AI cost is tracked in this app: the End-of-Term Comments generator
// (Milestone G.1) is deliberately ephemeral and persists nothing, so its
// cost never accumulates anywhere — a known, deliberate gap, not an
// oversight (see CONTEXT.md).
export async function getAssignmentUsageStats(): Promise<AssignmentUsageStats> {
  const rows = await prisma.assignment.findMany({
    where: { engine: { not: null } },
    select: { engine: true, totalTokens: true, estCostUsd: true },
  });

  const byEngineMap = new Map<string, { generations: number; tokens: number; costUsd: number }>();
  let totalTokens = 0;
  let totalCostUsd = 0;
  for (const r of rows) {
    const engine = r.engine!;
    const entry = byEngineMap.get(engine) ?? { generations: 0, tokens: 0, costUsd: 0 };
    entry.generations++;
    entry.tokens += r.totalTokens ?? 0;
    entry.costUsd += r.estCostUsd ?? 0;
    byEngineMap.set(engine, entry);
    totalTokens += r.totalTokens ?? 0;
    totalCostUsd += r.estCostUsd ?? 0;
  }

  const byEngine = [...byEngineMap.entries()]
    .map(([engine, v]) => ({ engine, label: AI_MODELS.find((m) => m.value === engine)?.label ?? engine, ...v }))
    .sort((a, b) => b.generations - a.generations);

  return { totalGenerations: rows.length, totalTokens, totalCostUsd, byEngine };
}
