import type { ExecutionStepDetail } from "../github/operations/comment-logic";
import type { SummaryResult } from "./summarize-report";

export function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = (totalSeconds % 60).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
  return `${totalSeconds.toFixed(1)}s`;
}

export function formatCostTable(
  steps: ExecutionStepDetail[],
  summary: SummaryResult,
): string {
  const rows: { label: string; duration_ms: number; cost_usd: number }[] = [];

  if (steps.length === 1) {
    rows.push({
      label: "Execution",
      duration_ms: steps[0]!.duration_ms,
      cost_usd: steps[0]!.total_cost_usd,
    });
  } else {
    for (let i = 0; i < steps.length; i++) {
      rows.push({
        label: `Execution ${i + 1}`,
        duration_ms: steps[i]!.duration_ms,
        cost_usd: steps[i]!.total_cost_usd,
      });
    }
  }

  const hasSummaryCost = summary.cost_usd > 0 || summary.duration_ms > 0;
  if (hasSummaryCost) {
    rows.push({
      label: "AI Summary",
      duration_ms: summary.duration_ms,
      cost_usd: summary.cost_usd,
    });
  }

  const totalDuration = rows.reduce((s, r) => s + r.duration_ms, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost_usd, 0);

  let table = "| Step | Duration | Cost |\n";
  table += "| :--- | ---: | ---: |\n";
  for (const row of rows) {
    table += `| ${row.label} | ${formatDuration(row.duration_ms)} | $${row.cost_usd.toFixed(4)} |\n`;
  }
  table += `| **Total** | **${formatDuration(totalDuration)}** | **$${totalCost.toFixed(4)}** |\n`;

  return table;
}
