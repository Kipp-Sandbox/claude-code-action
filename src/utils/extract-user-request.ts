/**
 * Splits a user request into individual slash commands.
 *
 * A slash command boundary is a line starting with /\w+.
 * Non-slash-command text stays as a single entry.
 * Multi-line arguments belong to the preceding command.
 *
 * @param userRequest - The full user request text
 * @returns Array of individual commands/requests
 */
export function splitSlashCommands(userRequest: string): string[] {
  const lines = userRequest.split("\n");
  const commands: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^\/\w+/.test(line) && current.length > 0) {
      commands.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }

  if (current.length > 0) {
    commands.push(current.join("\n"));
  }

  return commands;
}

/**
 * Extracts the user's request from a trigger comment.
 *
 * Given a comment like "@claude /review-pr please check the auth module",
 * this extracts "/review-pr please check the auth module".
 *
 * @param commentBody - The full comment body containing the trigger phrase
 * @param triggerPhrase - The trigger phrase (e.g., "@claude")
 * @returns The user's request (text after the trigger phrase), or null if not found
 */
export function extractUserRequest(
  commentBody: string | undefined,
  triggerPhrase: string,
): string | null {
  if (!commentBody) {
    return null;
  }

  // Use string operations instead of regex for better performance and security
  // (avoids potential ReDoS with large comment bodies)
  const triggerIndex = commentBody
    .toLowerCase()
    .indexOf(triggerPhrase.toLowerCase());
  if (triggerIndex === -1) {
    return null;
  }

  const afterTrigger = commentBody
    .substring(triggerIndex + triggerPhrase.length)
    .trim();
  return afterTrigger || null;
}
