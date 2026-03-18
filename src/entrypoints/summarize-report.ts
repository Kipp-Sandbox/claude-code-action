import type { Turn } from "./format-turns";
import { safeToolSummary } from "./format-turns";

type HaikuConnection = {
  baseUrl: string;
  apiKey: string;
};

/**
 * Detect the active provider from env vars and return connection info
 * for calling the summary model. Returns null for Bedrock/Vertex
 * (which use complex auth: AWS SigV4 or Google OAuth).
 */
export function resolveHaikuConnection(): HaikuConnection | null {
  // Direct Anthropic API
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      baseUrl: "https://api.anthropic.com",
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }

  // Azure Foundry
  if (process.env.ANTHROPIC_FOUNDRY_API_KEY) {
    let baseUrl = process.env.ANTHROPIC_FOUNDRY_BASE_URL;
    if (!baseUrl && process.env.ANTHROPIC_FOUNDRY_RESOURCE) {
      baseUrl = `https://${process.env.ANTHROPIC_FOUNDRY_RESOURCE}.services.ai.azure.com`;
    }
    if (baseUrl) {
      return {
        baseUrl,
        apiKey: process.env.ANTHROPIC_FOUNDRY_API_KEY,
      };
    }
  }

  // Bedrock/Vertex use complex auth; skip
  if (process.env.CLAUDE_CODE_USE_BEDROCK) {
    console.log(
      "Skipping AI summary: Bedrock provider uses AWS SigV4 auth (not supported for summary calls)",
    );
    return null;
  }
  if (process.env.CLAUDE_CODE_USE_VERTEX) {
    console.log(
      "Skipping AI summary: Vertex provider uses Google OAuth (not supported for summary calls)",
    );
    return null;
  }

  console.log("Skipping AI summary: no supported API credentials available");
  return null;
}

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
 * Generate a concise AI summary of the execution turns.
 * Returns null on any failure (network, parse, timeout, no credentials).
 */
export async function generateSummary(data: Turn[]): Promise<string | null> {
  const connection = resolveHaikuConnection();
  if (!connection) return null;

  const model = process.env.SUMMARY_MODEL || "claude-haiku-4-5";
  const context = extractSummaryContext(data);
  if (!context.trim()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${connection.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": connection.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system:
          "Summarize this Claude Code execution in a few concise paragraphs. Focus on key actions and outcomes. No markdown formatting. Keep it proportional to the work done.",
        messages: [{ role: "user", content: context }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.log(
        `Summary API returned ${res.status}; falling back to static summary`,
      );
      return null;
    }

    const body = (await res.json()) as {
      content: { type: string; text: string }[];
    };
    const text = body.content?.find((c) => c.type === "text")?.text;
    return text?.trim() || null;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      console.log("Summary generation timed out (10s); using static fallback");
    } else {
      console.log(
        `Summary generation failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
