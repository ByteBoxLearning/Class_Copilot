import "server-only";
import { canvasGet, canvasGetAllPages } from "./client";

export type CanvasOutcomeRating = { description: string; points: number };

export type CanvasOutcome = {
  id: number;
  title: string;
  display_name?: string | null;
  description?: string | null;
  vendor_guid?: string | null;
  mastery_points?: number | null;
  calculation_method?: string | null;
  calculation_int?: number | null;
  ratings?: CanvasOutcomeRating[];
};

type CanvasOutcomeGroup = { id: number };
type CanvasOutcomeLink = { outcome?: CanvasOutcome | null };

// Walks the full outcome-group tree linked into a course (root -> subgroups,
// recursively) and returns every distinct outcome found, deduped by id — an
// outcome can be linked into more than one group. `outcome_style=full` pulls
// the complete outcome object (mastery_points/calculation_method/ratings)
// inline, avoiding a second request per outcome.
export async function fetchCourseOutcomes(courseId: number): Promise<CanvasOutcome[]> {
  const root = await canvasGet<CanvasOutcomeGroup>(`/api/v1/courses/${courseId}/root_outcome_group`);

  const seenGroups = new Set<number>();
  const byId = new Map<number, CanvasOutcome>();

  async function walk(groupId: number): Promise<void> {
    if (seenGroups.has(groupId)) return; // defensive — Canvas groups are a tree, not expected to cycle
    seenGroups.add(groupId);

    const [links, subgroups] = await Promise.all([
      canvasGetAllPages<CanvasOutcomeLink>(`/api/v1/courses/${courseId}/outcome_groups/${groupId}/outcomes`, { outcome_style: "full" }),
      canvasGetAllPages<CanvasOutcomeGroup>(`/api/v1/courses/${courseId}/outcome_groups/${groupId}/subgroups`),
    ]);

    for (const link of links) {
      if (link.outcome) byId.set(link.outcome.id, link.outcome);
    }
    await Promise.all(subgroups.map((g) => walk(g.id)));
  }

  await walk(root.id);
  return [...byId.values()];
}
