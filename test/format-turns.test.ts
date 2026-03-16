import { expect, test, describe } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  formatTurnsFromData,
  groupTurnsNaturally,
  formatGroupedContent,
  detectContentType,
  formatResultContent,
  formatToolWithResult,
  safeToolSummary,
  formatToolSafe,
  type Turn,
  type ToolUse,
  type ToolResult,
} from "../src/entrypoints/format-turns";

describe("detectContentType", () => {
  test("detects JSON objects", () => {
    expect(detectContentType('{"key": "value"}')).toBe("json");
    expect(detectContentType('{"number": 42}')).toBe("json");
  });

  test("detects JSON arrays", () => {
    expect(detectContentType("[1, 2, 3]")).toBe("json");
    expect(detectContentType('["a", "b"]')).toBe("json");
  });

  test("detects Python code", () => {
    expect(detectContentType("def hello():\n    pass")).toBe("python");
    expect(detectContentType("import os")).toBe("python");
    expect(detectContentType("from math import pi")).toBe("python");
  });

  test("detects JavaScript code", () => {
    expect(detectContentType("function test() {}")).toBe("javascript");
    expect(detectContentType("const x = 5")).toBe("javascript");
    expect(detectContentType("let y = 10")).toBe("javascript");
    expect(detectContentType("const fn = () => console.log()")).toBe(
      "javascript",
    );
  });

  test("detects bash/shell content", () => {
    expect(detectContentType("/usr/bin/test")).toBe("bash");
    expect(detectContentType("Error: command not found")).toBe("bash");
    expect(detectContentType("ls -la")).toBe("bash");
    expect(detectContentType("$ echo hello")).toBe("bash");
  });

  test("detects diff format", () => {
    expect(detectContentType("@@ -1,3 +1,3 @@")).toBe("diff");
    expect(detectContentType("+++ file.txt")).toBe("diff");
    expect(detectContentType("--- file.txt")).toBe("diff");
  });

  test("detects HTML/XML", () => {
    expect(detectContentType("<div>hello</div>")).toBe("html");
    expect(detectContentType("<xml>content</xml>")).toBe("html");
  });

  test("detects markdown", () => {
    expect(detectContentType("- List item")).toBe("markdown");
    expect(detectContentType("* List item")).toBe("markdown");
    expect(detectContentType("```code```")).toBe("markdown");
  });

  test("defaults to text", () => {
    expect(detectContentType("plain text")).toBe("text");
    expect(detectContentType("just some words")).toBe("text");
  });
});

describe("formatResultContent", () => {
  test("handles empty content", () => {
    expect(formatResultContent("")).toBe("*(No output)*\n\n");
    expect(formatResultContent(null)).toBe("*(No output)*\n\n");
    expect(formatResultContent(undefined)).toBe("*(No output)*\n\n");
  });

  test("formats short text without code blocks", () => {
    const result = formatResultContent("success");
    expect(result).toBe("**→** success\n\n");
  });

  test("formats long text with code blocks", () => {
    const longText =
      "This is a longer piece of text that should be formatted in a code block because it exceeds the short text threshold";
    const result = formatResultContent(longText);
    expect(result).toContain("**Result:**");
    expect(result).toContain("```text");
    expect(result).toContain(longText);
  });

  test("pretty prints JSON content", () => {
    const jsonContent = '{"key": "value", "number": 42}';
    const result = formatResultContent(jsonContent);
    expect(result).toContain("```json");
    expect(result).toContain('"key": "value"');
    expect(result).toContain('"number": 42');
  });

  test("truncates very long content", () => {
    const veryLongContent = "A".repeat(4000);
    const result = formatResultContent(veryLongContent);
    expect(result).toContain("...");
    // Should not contain the full long content
    expect(result.length).toBeLessThan(veryLongContent.length);
  });

  test("handles type:text structure", () => {
    const structuredContent = [{ type: "text", text: "Hello world" }];
    const result = formatResultContent(JSON.stringify(structuredContent));
    expect(result).toBe("**→** Hello world\n\n");
  });
});

describe("formatToolWithResult", () => {
  test("formats tool with parameters and result", () => {
    const toolUse: ToolUse = {
      type: "tool_use",
      name: "read_file",
      input: { file_path: "/path/to/file.txt" },
      id: "tool_123",
    };

    const toolResult: ToolResult = {
      type: "tool_result",
      tool_use_id: "tool_123",
      content: "File content here",
      is_error: false,
    };

    const result = formatToolWithResult(toolUse, toolResult);

    expect(result).toContain("### 🔧 `read_file`");
    expect(result).toContain("**Parameters:**");
    expect(result).toContain('"file_path": "/path/to/file.txt"');
    expect(result).toContain("**→** File content here");
  });

  test("formats tool with error result", () => {
    const toolUse: ToolUse = {
      type: "tool_use",
      name: "failing_tool",
      input: { param: "value" },
    };

    const toolResult: ToolResult = {
      type: "tool_result",
      content: "Permission denied",
      is_error: true,
    };

    const result = formatToolWithResult(toolUse, toolResult);

    expect(result).toContain("### 🔧 `failing_tool`");
    expect(result).toContain("❌ **Error:** `Permission denied`");
  });

  test("formats tool without parameters", () => {
    const toolUse: ToolUse = {
      type: "tool_use",
      name: "simple_tool",
    };

    const result = formatToolWithResult(toolUse);

    expect(result).toContain("### 🔧 `simple_tool`");
    expect(result).not.toContain("**Parameters:**");
  });

  test("handles unknown tool name", () => {
    const toolUse: ToolUse = {
      type: "tool_use",
    };

    const result = formatToolWithResult(toolUse);

    expect(result).toContain("### 🔧 `unknown_tool`");
  });
});

describe("groupTurnsNaturally", () => {
  test("groups system initialization", () => {
    const data: Turn[] = [
      {
        type: "system",
        subtype: "init",
        tools: [{ name: "tool1" }, { name: "tool2" }],
      },
    ];

    const result = groupTurnsNaturally(data);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("system_init");
    expect(result[0]?.tools_count).toBe(2);
  });

  test("groups assistant actions with tool calls", () => {
    const data: Turn[] = [
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "I'll help you" },
            {
              type: "tool_use",
              id: "tool_123",
              name: "read_file",
              input: { file_path: "/test.txt" },
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool_123",
              content: "file content",
              is_error: false,
            },
          ],
        },
      },
    ];

    const result = groupTurnsNaturally(data);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("assistant_action");
    expect(result[0]?.text_parts).toEqual(["I'll help you"]);
    expect(result[0]?.tool_calls).toHaveLength(1);
    expect(result[0]?.tool_calls?.[0]?.tool_use.name).toBe("read_file");
    expect(result[0]?.tool_calls?.[0]?.tool_result?.content).toBe(
      "file content",
    );
    expect(result[0]?.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
  });

  test("groups user messages", () => {
    const data: Turn[] = [
      {
        type: "user",
        message: {
          content: [{ type: "text", text: "Please help me" }],
        },
      },
    ];

    const result = groupTurnsNaturally(data);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("user_message");
    expect(result[0]?.text_parts).toEqual(["Please help me"]);
  });

  test("groups final results", () => {
    const data: Turn[] = [
      {
        type: "result",
        cost_usd: 0.1234,
        duration_ms: 5000,
        result: "Task completed",
      },
    ];

    const result = groupTurnsNaturally(data);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("final_result");
    expect(result[0]?.data).toEqual(data[0]!);
  });
});

describe("formatGroupedContent", () => {
  test("formats system initialization", () => {
    const groupedContent = [
      {
        type: "system_init",
        tools_count: 3,
      },
    ];

    const result = formatGroupedContent(groupedContent);

    expect(result).toContain("## Claude Code Report");
    expect(result).toContain("## 🚀 System Initialization");
    expect(result).toContain("**Available Tools:** 3 tools loaded");
  });

  test("formats assistant actions", () => {
    const groupedContent = [
      {
        type: "assistant_action",
        text_parts: ["I'll help you with that"],
        tool_calls: [
          {
            tool_use: {
              type: "tool_use",
              name: "test_tool",
              input: { param: "value" },
            },
            tool_result: {
              type: "tool_result",
              content: "result",
              is_error: false,
            },
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    ];

    const result = formatGroupedContent(groupedContent);

    expect(result).toContain("I'll help you with that");
    expect(result).toContain("### 🔧 `test_tool`");
    expect(result).toContain("*Token usage: 100 input, 50 output*");
  });

  test("formats user messages", () => {
    const groupedContent = [
      {
        type: "user_message",
        text_parts: ["Help me please"],
      },
    ];

    const result = formatGroupedContent(groupedContent);

    expect(result).toContain("## 👤 User");
    expect(result).toContain("Help me please");
  });

  test("formats final results", () => {
    const groupedContent = [
      {
        type: "final_result",
        data: {
          type: "result",
          cost_usd: 0.1234,
          duration_ms: 5678,
          result: "Success!",
        } as Turn,
      },
    ];

    const result = formatGroupedContent(groupedContent);

    expect(result).toContain("## ✅ Final Result");
    expect(result).toContain("Success!");
    expect(result).toContain("**Cost:** $0.1234");
    expect(result).toContain("**Duration:** 5.7s");
  });
});

describe("formatTurnsFromData", () => {
  test("handles empty data", () => {
    const result = formatTurnsFromData([]);
    expect(result).toBe("## Claude Code Report\n\n");
  });

  test("formats complete conversation", () => {
    const data: Turn[] = [
      {
        type: "system",
        subtype: "init",
        tools: [{ name: "tool1" }],
      },
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "I'll help you" },
            {
              type: "tool_use",
              id: "tool_123",
              name: "read_file",
              input: { file_path: "/test.txt" },
            },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool_123",
              content: "file content",
              is_error: false,
            },
          ],
        },
      },
      {
        type: "result",
        cost_usd: 0.05,
        duration_ms: 2000,
        result: "Done",
      },
    ];

    const result = formatTurnsFromData(data);

    expect(result).toContain("## Claude Code Report");
    expect(result).toContain("## 🚀 System Initialization");
    expect(result).toContain("I'll help you");
    expect(result).toContain("### 🔧 `read_file`");
    expect(result).toContain("## ✅ Final Result");
    expect(result).toContain("Done");
  });
});

describe("safeToolSummary", () => {
  test("summarizes Read tool with file path", () => {
    const tool: ToolUse = {
      type: "tool_use",
      name: "Read",
      input: { file_path: "/src/main.ts" },
    };
    expect(safeToolSummary(tool)).toBe("Read /src/main.ts");
  });

  test("summarizes Edit tool with file path only", () => {
    const tool: ToolUse = {
      type: "tool_use",
      name: "Edit",
      input: {
        file_path: "/src/main.ts",
        old_string: "secret",
        new_string: "redacted",
      },
    };
    expect(safeToolSummary(tool)).toBe("Edit /src/main.ts");
  });

  test("summarizes Write tool with file path only", () => {
    const tool: ToolUse = {
      type: "tool_use",
      name: "Write",
      input: { file_path: "/src/new.ts", content: "secret content" },
    };
    expect(safeToolSummary(tool)).toBe("Write /src/new.ts");
  });

  test("summarizes Glob tool with pattern and path", () => {
    const tool: ToolUse = {
      type: "tool_use",
      name: "Glob",
      input: { pattern: "**/*.ts", path: "/src" },
    };
    expect(safeToolSummary(tool)).toBe("Glob **/*.ts in /src");
  });

  test("summarizes Glob tool with pattern only", () => {
    const tool: ToolUse = {
      type: "tool_use",
      name: "Glob",
      input: { pattern: "**/*.ts" },
    };
    expect(safeToolSummary(tool)).toBe("Glob **/*.ts");
  });

  test("summarizes Grep tool with pattern and path", () => {
    const tool: ToolUse = {
      type: "tool_use",
      name: "Grep",
      input: { pattern: "TODO", path: "/src" },
    };
    expect(safeToolSummary(tool)).toBe("Grep TODO in /src");
  });

  test("summarizes Bash tool with truncated command", () => {
    const tool: ToolUse = {
      type: "tool_use",
      name: "Bash",
      input: { command: "echo hello" },
    };
    expect(safeToolSummary(tool)).toBe("Bash echo hello");
  });

  test("truncates long Bash commands to 80 chars", () => {
    const longCmd = "a".repeat(100);
    const tool: ToolUse = {
      type: "tool_use",
      name: "Bash",
      input: { command: longCmd },
    };
    const result = safeToolSummary(tool);
    // "Bash " is 5 chars, truncated command is 80 chars
    expect(result).toBe("Bash " + "a".repeat(77) + "...");
  });

  test("uses first line of multiline Bash commands", () => {
    const tool: ToolUse = {
      type: "tool_use",
      name: "Bash",
      input: { command: "echo first\necho second\necho third" },
    };
    expect(safeToolSummary(tool)).toBe("Bash echo first");
  });

  test("summarizes Agent tool with description", () => {
    const tool: ToolUse = {
      type: "tool_use",
      name: "Agent",
      input: { description: "search for files" },
    };
    expect(safeToolSummary(tool)).toBe("Agent search for files");
  });

  test("summarizes MCP tools with name only", () => {
    const tool: ToolUse = {
      type: "tool_use",
      name: "mcp__github__get_file_contents",
      input: { owner: "org", repo: "repo", path: "secret.env" },
    };
    expect(safeToolSummary(tool)).toBe("mcp__github__get_file_contents");
  });

  test("handles unknown tool with no name", () => {
    const tool: ToolUse = { type: "tool_use" };
    expect(safeToolSummary(tool)).toBe("unknown_tool");
  });
});

describe("formatToolSafe", () => {
  test("formats successful tool call", () => {
    const toolUse: ToolUse = {
      type: "tool_use",
      name: "Read",
      input: { file_path: "/src/main.ts" },
    };
    const toolResult: ToolResult = {
      type: "tool_result",
      content: "file contents here",
      is_error: false,
    };
    expect(formatToolSafe(toolUse, toolResult)).toBe(
      "- :check: `Read /src/main.ts`\n",
    );
  });

  test("formats failed tool call", () => {
    const toolUse: ToolUse = {
      type: "tool_use",
      name: "Read",
      input: { file_path: "/missing.ts" },
    };
    const toolResult: ToolResult = {
      type: "tool_result",
      content: "File not found",
      is_error: true,
    };
    expect(formatToolSafe(toolUse, toolResult)).toBe(
      "- :x: `Read /missing.ts`\n",
    );
  });

  test("formats tool call without result", () => {
    const toolUse: ToolUse = {
      type: "tool_use",
      name: "Bash",
      input: { command: "ls" },
    };
    expect(formatToolSafe(toolUse)).toBe("- :check: `Bash ls`\n");
  });
});

describe("formatGroupedContent safe mode", () => {
  test("uses safe mode header", () => {
    const result = formatGroupedContent([], true);
    expect(result).toBe("## Claude Code Report (Safe Mode)\n\n");
  });

  test("shows compact system init", () => {
    const grouped = [{ type: "system_init", tools_count: 5 }];
    const result = formatGroupedContent(grouped, true);
    expect(result).toContain("*5 tools loaded*");
    expect(result).not.toContain("System Initialization");
  });

  test("shows assistant text and compact tool list", () => {
    const grouped = [
      {
        type: "assistant_action",
        text_parts: ["I'll read the file"],
        tool_calls: [
          {
            tool_use: {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/test.txt" },
            },
            tool_result: {
              type: "tool_result",
              content: "secret file content",
              is_error: false,
            },
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    ];
    const result = formatGroupedContent(grouped, true);
    expect(result).toContain("I'll read the file");
    expect(result).toContain("**Actions:**");
    expect(result).toContain("- :check: `Read /test.txt`");
    expect(result).toContain("*Token usage: 100 input, 50 output*");
    // Must NOT contain tool result content
    expect(result).not.toContain("secret file content");
    expect(result).not.toContain("**Parameters:**");
  });

  test("shows error status for failed tools", () => {
    const grouped = [
      {
        type: "assistant_action",
        text_parts: [],
        tool_calls: [
          {
            tool_use: {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/missing.txt" },
            },
            tool_result: {
              type: "tool_result",
              content: "File not found",
              is_error: true,
            },
          },
        ],
        usage: {},
      },
    ];
    const result = formatGroupedContent(grouped, true);
    expect(result).toContain("- :x: `Read /missing.txt`");
    expect(result).not.toContain("File not found");
  });

  test("omits system_other details", () => {
    const grouped = [
      { type: "system_other", data: { type: "system", subtype: "config" } },
    ];
    const result = formatGroupedContent(grouped, true);
    expect(result).toBe("## Claude Code Report (Safe Mode)\n\n");
  });

  test("shows final result", () => {
    const grouped = [
      {
        type: "final_result",
        data: {
          type: "result",
          total_cost_usd: 0.05,
          duration_ms: 3000,
          result: "Done!",
        } as Turn,
      },
    ];
    const result = formatGroupedContent(grouped, true);
    expect(result).toContain("## ✅ Final Result");
    expect(result).toContain("Done!");
    expect(result).toContain("**Cost:** $0.0500");
  });
});

describe("formatTurnsFromData safe mode", () => {
  test("handles empty data in safe mode", () => {
    const result = formatTurnsFromData([], true);
    expect(result).toBe("## Claude Code Report (Safe Mode)\n\n");
  });

  test("formats complete conversation in safe mode", () => {
    const data: Turn[] = [
      {
        type: "system",
        subtype: "init",
        tools: [{ name: "tool1" }],
      },
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "I'll help you" },
            {
              type: "tool_use",
              id: "tool_123",
              name: "Read",
              input: { file_path: "/test.txt" },
            },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool_123",
              content: "SECRET_API_KEY=abc123",
              is_error: false,
            },
          ],
        },
      },
      {
        type: "result",
        cost_usd: 0.05,
        duration_ms: 2000,
        result: "Done",
      },
    ];

    const result = formatTurnsFromData(data, true);

    expect(result).toContain("## Claude Code Report (Safe Mode)");
    expect(result).toContain("I'll help you");
    expect(result).toContain("- :check: `Read /test.txt`");
    expect(result).toContain("## ✅ Final Result");
    expect(result).toContain("Done");
    // Must NOT leak secrets
    expect(result).not.toContain("SECRET_API_KEY");
    expect(result).not.toContain("abc123");
    expect(result).not.toContain("**Parameters:**");
  });
});

describe("integration tests", () => {
  test("formats real conversation data correctly", () => {
    // Load the sample JSON data
    const jsonPath = join(__dirname, "fixtures", "sample-turns.json");
    const expectedPath = join(
      __dirname,
      "fixtures",
      "sample-turns-expected-output.md",
    );

    const jsonData = JSON.parse(readFileSync(jsonPath, "utf-8"));
    const expectedOutput = readFileSync(expectedPath, "utf-8").trim();

    // Format the data using our function
    const actualOutput = formatTurnsFromData(jsonData).trim();

    // Compare the outputs
    expect(actualOutput).toBe(expectedOutput);
  });

  test("formats real conversation data in safe mode correctly", () => {
    const jsonPath = join(__dirname, "fixtures", "sample-turns.json");
    const expectedPath = join(
      __dirname,
      "fixtures",
      "sample-turns-expected-output-safe.md",
    );

    const jsonData = JSON.parse(readFileSync(jsonPath, "utf-8"));
    const expectedOutput = readFileSync(expectedPath, "utf-8").trim();

    const actualOutput = formatTurnsFromData(jsonData, true).trim();

    expect(actualOutput).toBe(expectedOutput);
  });
});
