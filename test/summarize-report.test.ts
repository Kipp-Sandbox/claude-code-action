import { expect, test, describe, beforeEach, afterEach, mock } from "bun:test";
import type { Turn } from "../src/entrypoints/format-turns";
import {
  resolveHaikuConnection,
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

describe("resolveHaikuConnection", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_FOUNDRY_API_KEY;
    delete process.env.ANTHROPIC_FOUNDRY_BASE_URL;
    delete process.env.ANTHROPIC_FOUNDRY_RESOURCE;
    delete process.env.CLAUDE_CODE_USE_BEDROCK;
    delete process.env.CLAUDE_CODE_USE_VERTEX;
  });

  afterEach(restoreEnv);

  test("returns Direct Anthropic config when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key";
    const result = resolveHaikuConnection();
    expect(result).toEqual({
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-test-key",
    });
  });

  test("returns Foundry config with explicit base URL", () => {
    process.env.ANTHROPIC_FOUNDRY_API_KEY = "foundry-key";
    process.env.ANTHROPIC_FOUNDRY_BASE_URL = "https://custom.azure.com";
    const result = resolveHaikuConnection();
    expect(result).toEqual({
      baseUrl: "https://custom.azure.com",
      apiKey: "foundry-key",
    });
  });

  test("returns Foundry config with resource-derived URL", () => {
    process.env.ANTHROPIC_FOUNDRY_API_KEY = "foundry-key";
    process.env.ANTHROPIC_FOUNDRY_RESOURCE = "myresource";
    const result = resolveHaikuConnection();
    expect(result).toEqual({
      baseUrl: "https://myresource.services.ai.azure.com",
      apiKey: "foundry-key",
    });
  });

  test("returns null for Bedrock", () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = "1";
    expect(resolveHaikuConnection()).toBeNull();
  });

  test("returns null for Vertex", () => {
    process.env.CLAUDE_CODE_USE_VERTEX = "1";
    expect(resolveHaikuConnection()).toBeNull();
  });

  test("returns null when no credentials available", () => {
    expect(resolveHaikuConnection()).toBeNull();
  });

  test("prefers Direct Anthropic over Foundry", () => {
    process.env.ANTHROPIC_API_KEY = "sk-direct";
    process.env.ANTHROPIC_FOUNDRY_API_KEY = "foundry-key";
    process.env.ANTHROPIC_FOUNDRY_BASE_URL = "https://foundry.example.com";
    const result = resolveHaikuConnection();
    expect(result?.apiKey).toBe("sk-direct");
    expect(result?.baseUrl).toBe("https://api.anthropic.com");
  });
});

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
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_FOUNDRY_API_KEY;
    delete process.env.ANTHROPIC_FOUNDRY_BASE_URL;
    delete process.env.ANTHROPIC_FOUNDRY_RESOURCE;
    delete process.env.CLAUDE_CODE_USE_BEDROCK;
    delete process.env.CLAUDE_CODE_USE_VERTEX;
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

  test("returns null when no connection available", async () => {
    const result = await generateSummary(sampleTurns);
    expect(result).toBeNull();
  });

  test("returns null for empty context", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const result = await generateSummary([]);
    expect(result).toBeNull();
  });

  test("returns summary on successful API call", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            content: [
              { type: "text", text: "Claude fixed a bug in the main file." },
            ],
          }),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch;

    try {
      const result = await generateSummary(sampleTurns);
      expect(result).toBe("Claude fixed a bug in the main file.");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns null on API error", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Internal Server Error", { status: 500 })),
    ) as unknown as typeof fetch;

    try {
      const result = await generateSummary(sampleTurns);
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns null on network failure", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("Network error")),
    ) as unknown as typeof fetch;

    try {
      const result = await generateSummary(sampleTurns);
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("uses SUMMARY_MODEL env var", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.SUMMARY_MODEL = "custom-haiku-model";

    let capturedBody: string | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      (_url: string | URL | Request, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              content: [{ type: "text", text: "summary" }],
            }),
            { status: 200 },
          ),
        );
      },
    ) as unknown as typeof fetch;

    try {
      await generateSummary(sampleTurns);
      expect(capturedBody).toBeDefined();
      const parsed = JSON.parse(capturedBody!);
      expect(parsed.model).toBe("custom-haiku-model");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
