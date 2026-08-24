import { requireStaff } from "@/lib/auth";
import { listPendingPracticeProposals } from "@/actions/practice-review";
import { PageHeader } from "@/components/layout/page-header";
import { PracticeReviewList } from "@/components/practice/practice-review-list";

// Every practice result across the staff member's accessible classes, not
// scoped to a single "current class" — a review queue is meant to be cleared
// as a whole, not picked through one class at a time.
export default async function PracticeReviewPage() {
  await requireStaff();
  const proposals = await listPendingPracticeProposals();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Practice Review"
        subtitle="AI-scored practice results waiting for your review. Nothing here becomes a real mastery record until you approve it."
      />
      <PracticeReviewList proposals={proposals} />
    </div>
  );
}
