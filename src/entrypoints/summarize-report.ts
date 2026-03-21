import type { Turn } from "./format-turns";
import { safeToolSummary } from "./format-turns";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  SDKAssistantMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";

export type SummaryResult = {
  text: string | null;
  cost_usd: number;
  duration_ms: number;
};

/**
 * Extract a safe summary context from execution turns.
 * Includes assistant text and tool names (via safeToolSummary),
 * but never sends tool results or sensitive parameters.
 * Truncates to ~8000 chars.
 */
export function extractSummaryContext(data: Turn[]): string {
  const parts: string[] = [];

  for (const turn of data) {
    if (turn.type === "assistant") {
      const content = turn.message?.content || [];
      for (const item of content) {
        if (item.type === "text" && item.text?.trim()) {
          parts.push(item.text.trim());
        } else if (item.type === "tool_use") {
          parts.push(`[Tool: ${safeToolSummary(item)}]`);
        }
      }
    } else if (turn.type === "result") {
      if (turn.result) {
        parts.push(`[Result: ${turn.result}]`);
      }
    }
  }

  const joined = parts.join("\n");
  if (joined.length > 8000) {
    return joined.substring(0, 8000);
  }
  return joined;
}

/**
 * Generate a concise AI summary of the execution turns using the Claude SDK.
 * Works with all providers (Anthropic API, Azure Foundry, Bedrock, Vertex)
 * because the SDK reads the same provider env vars as the main execution.
 * Returns null text on any failure; cost_usd is always the summary call cost.
 */
export async function generateSummary(data: Turn[]): Promise<SummaryResult> {
  const model = process.env.SUMMARY_MODEL || "claude-haiku-4-5";
  const context = extractSummaryContext(data);
  if (!context.trim()) return { text: null, cost_usd: 0, duration_ms: 0 };

  let text: string | null = null;
  let cost_usd = 0;
  const startMs = Date.now();

  try {
    for await (const message of query({
      prompt: context,
      options: {
        model,
        maxTurns: 1,
        allowedTools: [],
        systemPrompt:
          "Summarize this Claude Code execution in a few concise paragraphs. Focus on key actions and outcomes. No markdown formatting. Keep it proportional to the work done.",
        settingSources: [],
      },
    })) {
      if (message.type === "assistant") {
        const assistantMsg = message as SDKAssistantMessage;
        const extracted = (
          assistantMsg.message.content as Array<{ type: string; text?: string }>
        )
          .filter((block) => block.type === "text")
          .map((block) => block.text ?? "")
          .join("")
          .trim();
        text = extracted || null;
      } else if (message.type === "result") {
        const resultMsg = message as SDKResultMessage;
        if (resultMsg.subtype === "success") {
          cost_usd = resultMsg.total_cost_usd;
        }
      }
    }
  } catch (e) {
    console.log(
      `Summary generation failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return { text, cost_usd, duration_ms: Date.now() - startMs };
}
