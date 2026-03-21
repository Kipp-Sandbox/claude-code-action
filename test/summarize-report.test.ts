import { expect, test, describe, beforeEach, afterEach, mock } from "bun:test";
import type { Turn } from "../src/entrypoints/format-turns";
import {
  extractSummaryContext,
  generateSummary,
} from "../src/entrypoints/summarize-report";

// Save original env so we can restore after each test
const originalEnv = { ...process.env };

function restoreEnv() {
  // Remove any keys we added
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  // Restore originals
  Object.assign(process.env, originalEnv);
}

describe("extractSummaryContext", () => {
  test("extracts assistant text parts", () => {
    const data: Turn[] = [
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "I'll help you fix the bug" }],
        },
      },
    ];
    const result = extractSummaryContext(data);
    expect(result).toContain("I'll help you fix the bug");
  });

  test("extracts tool names via safeToolSummary", () => {
    const data: Turn[] = [
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/src/main.ts" },
            },
          ],
        },
      },
    ];
    const result = extractSummaryContext(data);
    expect(result).toContain("[Tool: Read /src/main.ts]");
  });

  test("excludes tool results", () => {
    const data: Turn[] = [
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              content: "SECRET_KEY=abc123",
            },
          ],
        },
      },
    ];
    const result = extractSummaryContext(data);
    expect(result).not.toContain("SECRET_KEY");
    expect(result).not.toContain("abc123");
  });

  test("includes result turn text", () => {
    const data: Turn[] = [
      {
        type: "result",
        result: "Task completed successfully",
      },
    ];
    const result = extractSummaryContext(data);
    expect(result).toContain("[Result: Task completed successfully]");
  });

  test("truncates to 8000 chars", () => {
    const longText = "A".repeat(10000);
    const data: Turn[] = [
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: longText }],
        },
      },
    ];
    const result = extractSummaryContext(data);
    expect(result.length).toBe(8000);
  });

  test("handles empty turns", () => {
    const result = extractSummaryContext([]);
    expect(result).toBe("");
  });
});

describe("generateSummary", () => {
  beforeEach(() => {
    delete process.env.SUMMARY_MODEL;
  });

  afterEach(restoreEnv);

  const sampleTurns: Turn[] = [
    {
      type: "assistant",
      message: {
        content: [{ type: "text", text: "I fixed the bug in main.ts" }],
      },
    },
    {
      type: "result",
      subtype: "success",
      result: "Done",
    },
  ];

  test("returns null text and zero cost for empty context", async () => {
    const result = await generateSummary([]);
    expect(result.text).toBeNull();
    expect(result.cost_usd).toBe(0);
    expect(result.duration_ms).toBe(0);
  });

  test("returns summary text and cost from SDK messages", async () => {
    const summaryText = "Claude fixed a bug in the main file.";

    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: mock(async function* () {
        yield {
          type: "assistant",
          message: {
            content: [{ type: "text", text: summaryText }],
          },
          parent_tool_use_id: null,
          uuid: "test-uuid",
          session_id: "test-session",
        };
        yield {
          type: "result",
          subtype: "success",
          is_error: false,
          duration_ms: 100,
          num_turns: 1,
          total_cost_usd: 0.001,
        };
      }),
    }));

    const result = await generateSummary(sampleTurns);
    expect(result.text).toBe(summaryText);
    expect(result.cost_usd).toBe(0.001);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  test("returns null text and zero cost when query throws", async () => {
    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: mock(async function* () {
        throw new Error("Authentication failed");
        // eslint-disable-next-line @typescript-eslint/no-unreachable
        yield; // make TypeScript happy with generator typing
      }),
    }));

    const result = await generateSummary(sampleTurns);
    expect(result.text).toBeNull();
    expect(result.cost_usd).toBe(0);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  test("returns null text when no assistant message emitted", async () => {
    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: mock(async function* () {
        yield {
          type: "result",
          subtype: "success",
          is_error: false,
          duration_ms: 100,
          num_turns: 1,
          total_cost_usd: 0.001,
        };
      }),
    }));

    const result = await generateSummary(sampleTurns);
    expect(result.text).toBeNull();
    expect(result.cost_usd).toBe(0.001);
  });

  test("uses SUMMARY_MODEL env var", async () => {
    process.env.SUMMARY_MODEL = "custom-haiku-model";

    let capturedOptions: Record<string, unknown> | undefined;

    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: mock(async function* ({
        options,
      }: {
        options: Record<string, unknown>;
      }) {
        capturedOptions = options;
        yield {
          type: "assistant",
          message: { content: [{ type: "text", text: "summary" }] },
          parent_tool_use_id: null,
          uuid: "test-uuid",
          session_id: "test-session",
        };
      }),
    }));

    await generateSummary(sampleTurns);
    expect(capturedOptions?.model).toBe("custom-haiku-model");
  });

  test("calls query with no tools and no settings sources", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: mock(async function* ({
        options,
      }: {
        options: Record<string, unknown>;
      }) {
        capturedOptions = options;
        yield {
          type: "assistant",
          message: { content: [{ type: "text", text: "summary" }] },
          parent_tool_use_id: null,
          uuid: "test-uuid",
          session_id: "test-session",
        };
      }),
    }));

    await generateSummary(sampleTurns);
    expect(capturedOptions?.allowedTools).toEqual([]);
    expect(capturedOptions?.settingSources).toEqual([]);
    expect(capturedOptions?.maxTurns).toBe(1);
  });
});
