![Claude Code Action responding to a comment](https://github.com/user-attachments/assets/1d60c2e9-82ed-4ee5-b749-f9e021c85f4d)

# Claude Code Action

> [!NOTE] > **This is a fork of [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action).**
> Custom commits are rebased on top of upstream via a `sync-upstream` workflow.

## Fork Changes

### Slash Commands

- **Multi-slash-command support** -- Both tag mode and agent mode can run multiple slash commands from a single invocation (e.g. `/maintain deps auto` then `/ship auto`). Commands execute sequentially, stop on first failure, and resume the prior session so Claude retains full conversation context across commands.
- **Slash command detection in agent mode** -- Agent mode writes a separate `claude-user-request.txt` file, enabling the SDK's multi-block message path so slash commands work in automation workflows.

### Reporting

- **Safe report mode** -- The `display_report` input accepts `"safe"` in addition to `"true"` and `"false"`. Safe mode shows Claude's reasoning and a compact tool activity log (tool names, file paths, success/failure) but omits all tool results and sensitive parameters, making it suitable for public repos.

### Event and Auth Extensions

- **Push event support** -- Adds `push` to the set of recognised automation event types, allowing the action to trigger on push events.
- **Automation event token handling** -- Push and schedule events short-circuit token setup and return the default workflow token immediately instead of attempting OIDC exchange.
- **Azure Foundry API key support** -- Passes through `ANTHROPIC_FOUNDRY_API_KEY` for Azure AI Foundry authentication via API key (no OIDC required).

### Fork Maintenance

- **Upstream sync workflow** -- Manual `sync-upstream` workflow fetches upstream, identifies custom-only commits via patch-id comparison (dropping duplicates), cherry-picks them onto upstream, and force-pushes. Creates a backup branch before each sync for rollback safety. When a cherry-pick conflicts, the workflow installs Claude Code CLI and invokes Claude (via Azure AI Foundry) to resolve the conflict automatically. If Claude cannot resolve a conflict, the workflow fails and the backup branch remains for manual recovery.
- **Upstream workflow removal** -- All upstream CI/release/test workflows are removed. The sync workflow automatically strips any new workflow files introduced by upstream.

---

A general-purpose [Claude Code](https://claude.ai/code) action for GitHub PRs and issues that can answer questions and implement code changes. This action intelligently detects when to activate based on your workflow context—whether responding to @claude mentions, issue assignments, or executing automation tasks with explicit prompts. It supports multiple authentication methods including Anthropic direct API, Amazon Bedrock, Google Vertex AI, and Microsoft Foundry.

## Features

- 🎯 **Intelligent Mode Detection**: Automatically selects the appropriate execution mode based on your workflow context—no configuration needed
- 🤖 **Interactive Code Assistant**: Claude can answer questions about code, architecture, and programming
- 🔍 **Code Review**: Analyzes PR changes and suggests improvements
- ✨ **Code Implementation**: Can implement simple fixes, refactoring, and even new features
- 💬 **PR/Issue Integration**: Works seamlessly with GitHub comments and PR reviews
- 🛠️ **Flexible Tool Access**: Access to GitHub APIs and file operations (additional tools can be enabled via configuration)
- 📋 **Progress Tracking**: Visual progress indicators with checkboxes that dynamically update as Claude completes tasks
- 📊 **Structured Outputs**: Get validated JSON results that automatically become GitHub Action outputs for complex automations
- 🏃 **Runs on Your Infrastructure**: The action executes entirely on your own GitHub runner (Anthropic API calls go to your chosen provider)
- ⚙️ **Simplified Configuration**: Unified `prompt` and `claude_args` inputs provide clean, powerful configuration aligned with Claude Code SDK

## 📦 Upgrading from v0.x?

**See our [Migration Guide](./docs/migration-guide.md)** for step-by-step instructions on updating your workflows to v1.0. The new version simplifies configuration while maintaining compatibility with most existing setups.

## Quickstart

The easiest way to set up this action is through [Claude Code](https://claude.ai/code) in the terminal. Just open `claude` and run `/install-github-app`.

This command will guide you through setting up the GitHub app and required secrets.

**Note**:

- You must be a repository admin to install the GitHub app and add secrets
- This quickstart method is only available for direct Anthropic API users. For AWS Bedrock, Google Vertex AI, or Microsoft Foundry setup, see [docs/cloud-providers.md](./docs/cloud-providers.md).

## 📚 Solutions & Use Cases

Looking for specific automation patterns? Check our **[Solutions Guide](./docs/solutions.md)** for complete working examples including:

- **🔍 Automatic PR Code Review** - Full review automation
- **📂 Path-Specific Reviews** - Trigger on critical file changes
- **👥 External Contributor Reviews** - Special handling for new contributors
- **📝 Custom Review Checklists** - Enforce team standards
- **🔄 Scheduled Maintenance** - Automated repository health checks
- **🏷️ Issue Triage & Labeling** - Automatic categorization
- **📖 Documentation Sync** - Keep docs updated with code changes
- **🔒 Security-Focused Reviews** - OWASP-aligned security analysis
- **📊 DIY Progress Tracking** - Create tracking comments in automation mode

Each solution includes complete working examples, configuration details, and expected outcomes.

## Documentation

- **[Solutions Guide](./docs/solutions.md)** - **🎯 Ready-to-use automation patterns**
- **[Migration Guide](./docs/migration-guide.md)** - **⭐ Upgrading from v0.x to v1.0**
- [Setup Guide](./docs/setup.md) - Manual setup, custom GitHub apps, and security best practices
- [Usage Guide](./docs/usage.md) - Basic usage, workflow configuration, and input parameters
- [Custom Automations](./docs/custom-automations.md) - Examples of automated workflows and custom prompts
- [Configuration](./docs/configuration.md) - MCP servers, permissions, environment variables, and advanced settings
- [Experimental Features](./docs/experimental.md) - Execution modes and network restrictions
- [Cloud Providers](./docs/cloud-providers.md) - AWS Bedrock, Google Vertex AI, and Microsoft Foundry setup
- [Capabilities & Limitations](./docs/capabilities-and-limitations.md) - What Claude can and cannot do
- [Security](./docs/security.md) - Access control, permissions, and commit signing
- [FAQ](./docs/faq.md) - Common questions and troubleshooting

## 📚 FAQ

Having issues or questions? Check out our [Frequently Asked Questions](./docs/faq.md) for solutions to common problems and detailed explanations of Claude's capabilities and limitations.

## License

This project is licensed under the MIT License—see the LICENSE file for details.
