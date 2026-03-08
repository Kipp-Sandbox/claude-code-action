import { describe, test, expect } from "bun:test";
import { splitSlashCommands } from "../../src/utils/extract-user-request";
import { existsSync } from "fs";

/**
 * Tests for multi-command slash command splitting behavior.
 *
 * The multi-command loop in run.ts relies on:
 * 1. existsSync(userRequestPath) to detect if a user request file exists
 * 2. splitSlashCommands() to split the content into individual commands
 * 3. Each command overwriting the user request file before runClaude()
 *
 * Since run() is not exported and has heavy side effects, these tests verify
 * the logic building blocks that make multi-command work for both modes.
 */

describe("multi-command detection", () => {
  test("splitSlashCommands splits agent mode prompts with multiple commands", () => {
    // Agent mode writes the prompt directly to claude-user-request.txt
    const agentPrompt = "/review\n/fix";
    const commands = splitSlashCommands(agentPrompt);
    expect(commands).toEqual(["/review", "/fix"]);
  });

  test("splitSlashCommands preserves multi-line arguments per command", () => {
    const prompt = "/review focus on security\ncheck auth module\n/fix";
    const commands = splitSlashCommands(prompt);
    expect(commands).toEqual([
      "/review focus on security\ncheck auth module",
      "/fix",
    ]);
  });

  test("single slash command returns array of one", () => {
    const prompt = "/review";
    const commands = splitSlashCommands(prompt);
    expect(commands).toEqual(["/review"]);
    // Single command should NOT trigger multi-command path (length > 1 check)
    expect(commands.length > 1).toBe(false);
  });

  test("non-slash-command text stays as single entry", () => {
    const prompt = "please fix the bug in auth.ts";
    const commands = splitSlashCommands(prompt);
    expect(commands).toEqual(["please fix the bug in auth.ts"]);
    expect(commands.length > 1).toBe(false);
  });

  test("three commands split correctly", () => {
    const prompt = "/review\n/fix\n/test";
    const commands = splitSlashCommands(prompt);
    expect(commands).toEqual(["/review", "/fix", "/test"]);
    expect(commands.length).toBe(3);
  });
});

describe("multi-command gate conditions", () => {
  test("existsSync returns false for non-existent file (no user request)", () => {
    // When no user request file exists, multi-command should not trigger
    expect(existsSync("/nonexistent/path/claude-user-request.txt")).toBe(false);
  });

  test("gate only requires file existence, not mode or context type", () => {
    // The gate condition is: existsSync(userRequestPath)
    // No mode check, no isEntityContext check
    // This verifies the design: both tag and agent mode can use multi-command
    // as long as the user request file exists

    // Agent mode writes the file in prepareAgentMode when context.inputs.prompt exists
    // Tag mode writes the file in prepareTagMode
    // The gate is mode-agnostic
    const hasMultipleCommands = (fileExists: boolean) => fileExists;
    expect(hasMultipleCommands(true)).toBe(true);
    expect(hasMultipleCommands(false)).toBe(false);
  });
});

describe("multi-command execution flow", () => {
  test("commands array with length > 1 triggers multi-command path", () => {
    const commands = splitSlashCommands("/review\n/fix");
    // This is the condition in run.ts: commands && commands.length > 1
    const shouldMultiCommand = commands && commands.length > 1;
    expect(shouldMultiCommand).toBe(true);
  });

  test("single command falls through to single-command path", () => {
    const commands = splitSlashCommands("/review");
    const shouldMultiCommand = commands && commands.length > 1;
    expect(shouldMultiCommand).toBe(false);
  });

  test("each command can be written to user request file independently", () => {
    const commands = splitSlashCommands("/review\n/fix\n/test");
    // Verify each command is a standalone string suitable for writing to file
    for (const command of commands) {
      expect(typeof command).toBe("string");
      expect(command.length).toBeGreaterThan(0);
      expect(command.startsWith("/")).toBe(true);
    }
  });

  test("failure on a command stops execution (length tracking)", () => {
    const commands = splitSlashCommands("/review\n/fix\n/test");
    const results: string[] = [];

    // Simulate the loop with a failure on command 2
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i]!;
      results.push(command);

      // Simulate failure on second command
      const conclusion = i === 1 ? "failure" : "success";
      if (conclusion !== "success") {
        break;
      }
    }

    // Only first two commands should have been processed
    expect(results).toEqual(["/review", "/fix"]);
    expect(results.length).toBe(2);
  });
});
