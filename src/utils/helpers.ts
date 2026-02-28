export function extractRepoName(workflowId: string): string {
  const match = workflowId.match(/^investigate-single-(.+)-\d+$/)
  return match ? match[1] : workflowId
}
