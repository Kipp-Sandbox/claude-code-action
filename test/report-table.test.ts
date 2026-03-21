import { describe, it, expect } from "bun:test";
import {
  formatDuration,
  formatCostTable,
} from "../src/entrypoints/report-table";
import type { SummaryResult } from "../src/entrypoints/summarize-report";
import type { ExecutionStepDetail } from "../src/github/operations/comment-logic";

describe("formatDuration", () => {
  it("formats seconds", () => {
    expect(formatDuration(5000)).toBe("5.0s");
  });

  it("formats fractional seconds", () => {
    expect(formatDuration(18750)).toBe("18.8s");
  });

  it("formats zero", () => {
    expect(formatDuration(0)).toBe("0.0s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(95200)).toBe("1m 35s");
  });

  it("formats exact minutes", () => {
    expect(formatDuration(120000)).toBe("2m 0s");
  });
});

describe("formatCostTable", () => {
  const baseSummary: SummaryResult = {
    text: "summary",
    cost_usd: 0.001,
    duration_ms: 4200,
  };

  it("renders single execution step with AI Summary", () => {
    const steps: ExecutionStepDetail[] = [
      { total_cost_usd: 0.3756, duration_ms: 95200 },
    ];
    const result = formatCostTable(steps, baseSummary);

    expect(result).toContain("| Execution |");
    expect(result).toContain("| AI Summary |");
    expect(result).toContain("| **Total** |");
    expect(result).not.toContain("Execution 1");
  });

  it("renders multiple execution steps with numbered labels", () => {
    const steps: ExecutionStepDetail[] = [
      { total_cost_usd: 0.25, duration_ms: 60000 },
      { total_cost_usd: 0.1256, duration_ms: 35200 },
    ];
    const result = formatCostTable(steps, baseSummary);

    expect(result).toContain("| Execution 1 |");
    expect(result).toContain("| Execution 2 |");
    expect(result).toContain("| AI Summary |");
    expect(result).toContain("| **Total** |");
  });

  it("omits AI Summary row when both cost and duration are zero", () => {
    const steps: ExecutionStepDetail[] = [
      { total_cost_usd: 0.05, duration_ms: 30000 },
    ];
    const summary: SummaryResult = {
      text: null,
      cost_usd: 0,
      duration_ms: 0,
    };
    const result = formatCostTable(steps, summary);

    expect(result).toContain("| Execution |");
    expect(result).not.toContain("AI Summary");
    expect(result).toContain("| **Total** |");
  });

  it("shows AI Summary row when cost is nonzero", () => {
    const steps: ExecutionStepDetail[] = [
      { total_cost_usd: 0.05, duration_ms: 30000 },
    ];
    const summary: SummaryResult = {
      text: "summary",
      cost_usd: 0.001,
      duration_ms: 0,
    };
    const result = formatCostTable(steps, summary);
    expect(result).toContain("| AI Summary |");
  });

  it("computes correct totals", () => {
    const steps: ExecutionStepDetail[] = [
      { total_cost_usd: 0.25, duration_ms: 60000 },
      { total_cost_usd: 0.1, duration_ms: 30000 },
    ];
    const summary: SummaryResult = {
      text: "summary",
      cost_usd: 0.001,
      duration_ms: 4000,
    };
    const result = formatCostTable(steps, summary);

    expect(result).toContain("**$0.3510**");
    expect(result).toContain("**1m 34s**");
  });

  it("handles empty steps with only summary cost", () => {
    const steps: ExecutionStepDetail[] = [];
    const summary: SummaryResult = {
      text: "summary",
      cost_usd: 0.001,
      duration_ms: 2000,
    };
    const result = formatCostTable(steps, summary);

    expect(result).toContain("| AI Summary |");
    expect(result).toContain("| **Total** |");
    expect(result).not.toContain("Execution");
  });
});
