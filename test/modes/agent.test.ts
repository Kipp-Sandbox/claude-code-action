import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from "bun:test";
import { readFile } from "fs/promises";
import { prepareAgentMode } from "../../src/modes/agent";
import { createMockAutomationContext } from "../mockContext";
import * as core from "@actions/core";
import * as gitConfig from "../../src/github/operations/git-config";

describe("Agent Mode", () => {
  let exportVariableSpy: any;
  let setOutputSpy: any;
  let configureGitAuthSpy: any;

  beforeEach(() => {
    exportVariableSpy = spyOn(core, "exportVariable").mockImplementation(
      () => {},
    );
    setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
    // Mock configureGitAuth to prevent actual git commands from running
    configureGitAuthSpy = spyOn(
      gitConfig,
      "configureGitAuth",
    ).mockImplementation(async () => {
      // Do nothing - prevent actual git config modifications
    });
  });

  afterEach(() => {
    exportVariableSpy?.mockClear();
    setOutputSpy?.mockClear();
    configureGitAuthSpy?.mockClear();
    exportVariableSpy?.mockRestore();
    setOutputSpy?.mockRestore();
    configureGitAuthSpy?.mockRestore();
  });

  test("prepareAgentMode is exported as a function", () => {
    expect(typeof prepareAgentMode).toBe("function");
  });

  test("prepare passes through claude_args", async () => {
    // Clear any previous calls before this test
    exportVariableSpy.mockClear();
    setOutputSpy.mockClear();

    const contextWithCustomArgs = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });

    // Save original env vars and set test values
    const originalHeadRef = process.env.GITHUB_HEAD_REF;
    const originalRefName = process.env.GITHUB_REF_NAME;
    delete process.env.GITHUB_HEAD_REF;
    delete process.env.GITHUB_REF_NAME;

    // Set CLAUDE_ARGS environment variable
    process.env.CLAUDE_ARGS = "--model claude-sonnet-4 --max-turns 10";

    const mockOctokit = {
      rest: {
        users: {
          getAuthenticated: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
          getByUsername: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
        },
      },
    } as any;
    const result = await prepareAgentMode({
      context: contextWithCustomArgs,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Verify claude_args includes user args (no MCP config in agent mode without allowed tools)
    expect(result.claudeArgs).toBe("--model claude-sonnet-4 --max-turns 10");
    expect(result.claudeArgs).not.toContain("--mcp-config");

    // Verify return structure - should use "main" as fallback when no env vars set
    expect(result).toEqual({
      commentId: undefined,
      branchInfo: {
        baseBranch: "main",
        currentBranch: "main",
        claudeBranch: undefined,
      },
      mcpConfig: expect.any(String),
      claudeArgs: "--model claude-sonnet-4 --max-turns 10",
    });

    // Clean up
    delete process.env.CLAUDE_ARGS;
    if (originalHeadRef !== undefined)
      process.env.GITHUB_HEAD_REF = originalHeadRef;
    if (originalRefName !== undefined)
      process.env.GITHUB_REF_NAME = originalRefName;
  });

  test("prepare rejects bot actors without allowed_bots", async () => {
    const contextWithPrompts = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    contextWithPrompts.actor = "claude[bot]";
    contextWithPrompts.inputs.allowedBots = "";

    const mockOctokit = {
      rest: {
        users: {
          getByUsername: mock(() =>
            Promise.resolve({
              data: { login: "claude[bot]", id: 12345, type: "Bot" },
            }),
          ),
        },
      },
    } as any;

    await expect(
      prepareAgentMode({
        context: contextWithPrompts,
        octokit: mockOctokit,
        githubToken: "test-token",
      }),
    ).rejects.toThrow(
      "Workflow initiated by non-human actor: claude (type: Bot)",
    );
  });

  test("prepare allows bot actors when in allowed_bots list", async () => {
    const contextWithPrompts = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    contextWithPrompts.actor = "dependabot[bot]";
    contextWithPrompts.inputs.allowedBots = "dependabot";

    const mockOctokit = {
      rest: {
        users: {
          getByUsername: mock(() =>
            Promise.resolve({
              data: { login: "dependabot[bot]", id: 12345, type: "Bot" },
            }),
          ),
        },
      },
    } as any;

    // Should not throw - bot is in allowed list
    await expect(
      prepareAgentMode({
        context: contextWithPrompts,
        octokit: mockOctokit,
        githubToken: "test-token",
      }),
    ).resolves.toBeDefined();
  });

  test("prepare creates prompt file with correct content", async () => {
    const contextWithPrompts = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    // In v1-dev, we only have the unified prompt field
    contextWithPrompts.inputs.prompt = "Custom prompt content";

    const mockOctokit = {
      rest: {
        users: {
          getAuthenticated: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
          getByUsername: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
        },
      },
    } as any;
    const result = await prepareAgentMode({
      context: contextWithPrompts,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // With our conditional MCP logic, agent mode with no allowed tools
    // should not include any MCP config
    expect(result.claudeArgs).not.toContain("--mcp-config");
  });

  test("prepare writes user request file for slash command detection", async () => {
    const context = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    context.inputs.prompt = "/maintaining-code audit deps";

    const mockOctokit = {
      rest: {
        users: {
          getAuthenticated: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
          getByUsername: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
        },
      },
    } as any;

    await prepareAgentMode({
      context,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    const promptDir = `${process.env.RUNNER_TEMP || "/tmp"}/claude-prompts`;

    // System context goes in claude-prompt.txt
    const promptContent = await readFile(
      `${promptDir}/claude-prompt.txt`,
      "utf-8",
    );
    expect(promptContent).toBe(
      `Repository: ${context.repository.owner}/${context.repository.repo}`,
    );

    // User's prompt goes in claude-user-request.txt for slash command detection
    const userRequest = await readFile(
      `${promptDir}/claude-user-request.txt`,
      "utf-8",
    );
    expect(userRequest).toBe("/maintaining-code audit deps");
  });

  test("prepare does not write user request file when prompt is empty", async () => {
    const context = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    context.inputs.prompt = "";

    const mockOctokit = {
      rest: {
        users: {
          getAuthenticated: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
          getByUsername: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
        },
      },
    } as any;

    await prepareAgentMode({
      context,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    const promptDir = `${process.env.RUNNER_TEMP || "/tmp"}/claude-prompts`;

    // System context fallback goes in claude-prompt.txt
    const promptContent = await readFile(
      `${promptDir}/claude-prompt.txt`,
      "utf-8",
    );
    expect(promptContent).toBe(
      `Repository: ${context.repository.owner}/${context.repository.repo}`,
    );
  });
});
