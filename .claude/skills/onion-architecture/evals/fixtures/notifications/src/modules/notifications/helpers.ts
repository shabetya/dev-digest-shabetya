export interface ReviewSummary {
  id: string;
  prTitle: string;
  findingCount: number;
}

export function formatReviewMessage(name: string, review: ReviewSummary): string {
  const noun = review.findingCount === 1 ? 'finding' : 'findings';
  return `${name}, review of "${review.prTitle}" finished with ${review.findingCount} ${noun}.`;
}
